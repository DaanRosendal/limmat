// Runs every probe against every library in headless Chromium and writes results.json.
//
//   node benchmarks/compare/run.mjs              everything, including the npm and GitHub metadata
//   node benchmarks/compare/run.mjs --no-meta    offline: keep the release dates, repo dates and dependency counts of the previous results.json
//   --only a,b       only these libraries (the results.json is then not written, the table is printed)
//   --probes p1,p6   only probes whose id starts with one of these (same rule)
//   --once           run each probe once instead of twice (spike runs, the results.json is not written)
//
// Each (library, probe) pair gets a fresh browser context and runs twice. If the two runs disagree the run fails and writes nothing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { makeCanon } from './canon.mjs';
import { extraBuild, localMeta, networkMeta, ROOT, TOOLS } from './meta.mjs';
import { initScript, makeKit } from './page.mjs';
import { COMMONMARK, PROBES } from './probes.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const requireRoot = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = requireRoot('playwright');
const esbuild = requireRoot('esbuild');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1].split(',') : null);
const only = opt('--only');
const onlyProbes = opt('--probes');
const once = flag('--once');
const partial = Boolean(only || onlyProbes || once);
const libs = TOOLS.map((t) => t.id).filter((id) => !only || only.includes(id));
const probes = PROBES.filter((p) => !onlyProbes || onlyProbes.some((o) => p.id.startsWith(o)));
const withCommonmark = !onlyProbes || onlyProbes.some((o) => COMMONMARK.id.startsWith(o));
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

// 1. Bundles: limmat from the local build, the others from benchmarks/compare/node_modules.
function bundle() {
  execFileSync('node', ['scripts/build.mjs'], { cwd: ROOT, stdio: 'ignore' });
  fs.mkdirSync(path.join(HERE, '.build'), { recursive: true });
  return Promise.all(
    libs.map(async (id) => {
      const extra = await extraBuild(TOOLS.find((t) => t.id === id));
      return esbuild.build({
        entryPoints: [path.join(HERE, 'adapters', `${id}.js`)],
        outfile: path.join(HERE, '.build', `${id}.js`),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        conditions: extra.conditions,
        external: TOOLS.find((t) => t.id === id).optional,
        define: extra.define,
        plugins: extra.plugins,
        loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
        minify: true,
        logLevel: 'error',
      });
    }),
  );
}

// 2. One fresh context per (library, probe, run): only https://app.test/ is answered, everything else is logged and aborted.
async function session(browser, id, fn) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const st = { reqs: [], dialogs: 0 };
  ctx.on('page', (p) => p.close().catch(() => {}));
  page.on('dialog', (d) => {
    st.dialogs++;
    d.dismiss().catch(() => {});
  });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === 'https://app.test' && u.pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' });
    }
    if (u.pathname !== '/favicon.ico') st.reqs.push({ host: u.hostname, path: u.pathname + u.search });
    return route.abort();
  });
  await page.addInitScript({ content: `(${initScript.toString()})()` });
  await page.goto('https://app.test/');
  await page.addScriptTag({ content: fs.readFileSync(path.join(HERE, '.build', `${id}.js`), 'utf8') });
  await page.addScriptTag({ content: `window.KIT = (${makeKit.toString()})()` });
  try {
    return await fn(page, st);
  } finally {
    await ctx.close();
  }
}

async function runProbeOnce(browser, id, probe) {
  return session(browser, id, async (page, st) => {
    const records = [];
    for (const p of probe.payloads) {
      for (const mode of p.modes || ['whole', 'chars']) {
        st.reqs.length = 0;
        st.dialogs = 0;
        const rec = await page.evaluate(([t, m, c]) => window.KIT.runPayload(t, m, c), [p.md, mode, Boolean(p.click)]);
        records.push({ ...rec, payload: p.id, mode, control: Boolean(p.control), reqs: [...st.reqs], dialogs: st.dialogs });
      }
    }
    return probe.judge(records);
  });
}

async function runCommonmarkOnce(browser, id, spec) {
  return session(browser, id, (page) => page.evaluate(([s, src]) => window.KIT.commonmark(s, src), [spec, makeCanon.toString()]));
}

// Runs `fn` twice and fails loudly if the two runs differ.
async function twice(label, fn, disagreements) {
  const a = await fn();
  if (once) return a;
  const b = await fn();
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    disagreements.push({ label, a, b });
    log(`DISAGREEMENT ${label}`);
  }
  return a;
}

async function runLib(id, spec, disagreements) {
  const browser = await chromium.launch();
  const out = { probes: {}, commonmark: null };
  try {
    for (const probe of probes) {
      const t0 = Date.now();
      try {
        out.probes[probe.id] = await twice(`${id} ${probe.id}`, () => runProbeOnce(browser, id, probe), disagreements);
      } catch (e) {
        out.probes[probe.id] = {
          result: 'error',
          detail: String(e.message || e)
            .split('\n')[0]
            .slice(0, 200),
        };
      }
      log(id, probe.id, out.probes[probe.id].result, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    if (withCommonmark) {
      try {
        out.commonmark = await twice(`${id} ${COMMONMARK.id}`, () => runCommonmarkOnce(browser, id, spec), disagreements);
        log(id, COMMONMARK.id, `${out.commonmark.passed}/${spec.length}`);
      } catch (e) {
        out.commonmark = {
          error: String(e.message || e)
            .split('\n')[0]
            .slice(0, 200),
        };
        log(id, COMMONMARK.id, 'error', out.commonmark.error);
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

function table(tools) {
  const ids = [...PROBES.map((p) => p.id), COMMONMARK.id].map((p) => p.split('-')[0]);
  const rows = [['library', 'version', ...ids]];
  for (const t of tools) {
    const cells = [t.id, t.versionLabel || t.version || ''];
    for (const p of PROBES) {
      const r = t.probes[p.id];
      cells.push(!r ? '-' : p.id === 'p6-markers' && r.constructs !== undefined ? `${r.result} ${r.leaked}/${r.constructs}` : r.result);
    }
    const c = t.probes[COMMONMARK.id];
    cells.push(c && c.passed !== undefined ? `${c.passed}/${c.total} (s${c.strict} t${c.textOnly})` : '-');
    rows.push(cells);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ')).join('\n');
}

async function main() {
  const resultsFile = path.join(HERE, 'results.json');
  const previous = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : null;
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/commonmark-spec.json'), 'utf8'));
  log('building bundles');
  await bundle();
  log('running', libs.join(', '));
  const disagreements = [];
  const runs = await Promise.all(libs.map((id) => runLib(id, spec, disagreements)));
  if (disagreements.length) {
    console.error('\nThe two runs of these probes disagree, so nothing is written (flaky probe or flaky machine load):');
    for (const d of disagreements)
      console.error(`- ${d.label}\n  run 1: ${JSON.stringify(d.a).slice(0, 300)}\n  run 2: ${JSON.stringify(d.b).slice(0, 300)}`);
    process.exit(1);
  }

  const local = await localMeta();
  let net = {};
  if (!flag('--no-meta') && !partial) {
    log('collecting npm and GitHub metadata');
    net = await networkMeta(local);
  } else if (previous) {
    for (const t of previous.tools)
      net[t.id] = { releaseDate: t.releaseDate, firstRelease: t.firstRelease, lastCommit: t.lastCommit, totalDeps: t.totalDeps };
  } else if (!partial) {
    console.error('--no-meta needs a previous results.json to take the metadata from');
    process.exit(1);
  }

  const failures = {};
  const tools = libs.map((id, i) => {
    const r = runs[i];
    const probesOut = { ...r.probes };
    if (r.commonmark) {
      const c = r.commonmark;
      probesOut[COMMONMARK.id] = c.error
        ? { result: 'error', detail: c.error }
        : { result: 'info', passed: c.passed, total: spec.length, strict: c.strict, textOnly: c.textOnly };
      if (!c.error) failures[id] = c.failed;
    }
    for (const v of Object.values(probesOut)) {
      // internal fields of the judges that are not part of the schema
      delete v.crashed;
    }
    return { ...local[id], ...(net[id] || {}), probes: probesOut };
  });

  console.log(`\n${table(tools)}\n`);
  for (const t of tools) for (const [k, v] of Object.entries(t.probes)) if (v.detail) console.log(`${t.id} ${k}: ${v.detail}`);

  if (partial) {
    console.log('\nPartial run: results.json, probes.json and commonmark-failures.json were not written.');
    return;
  }
  const node = process.versions.node;
  const probeBrowser = await chromium.launch();
  const chromiumVersion = probeBrowser.version();
  await probeBrowser.close();
  const results = {
    schema: 1,
    checkedOn: new Date().toISOString().slice(0, 10),
    environment: { node, playwright: requireRoot('playwright/package.json').version, chromium: chromiumVersion },
    tools,
  };
  fs.writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
  const table2 = [...PROBES, COMMONMARK].map((p) => ({
    id: p.id,
    title: p.title,
    diagnostic: Boolean(p.diagnostic),
    sources: p.sources,
    oracle: p.oracle,
    payloads: p.payloads?.map((x) => ({ id: x.id, markdown: x.md })),
  }));
  fs.writeFileSync(path.join(HERE, 'probes.json'), `${JSON.stringify(table2, null, 2)}\n`);
  const failLines = Object.entries(failures).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  fs.writeFileSync(
    path.join(HERE, 'commonmark-failures.json'),
    `{\n  "spec": "0.31.2",\n  "note": "example numbers each library fails under the lenient normaliser",\n${failLines.join(',\n')}\n}\n`,
  );
  console.log('Wrote results.json, probes.json and commonmark-failures.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
