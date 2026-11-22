// Package facts. localMeta() works offline from the installed packages. networkMeta() asks npm and GitHub.
// Run `node benchmarks/compare/run.mjs --no-meta` to skip networkMeta() and keep the previous values from results.json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ROOT = path.resolve(HERE, '../..');
const requireRoot = createRequire(path.join(ROOT, 'package.json'));
const esbuild = requireRoot('esbuild');

// One row per library. `peers` are left out of the installed-package count (the user already has them).
export const TOOLS = [
  {
    id: 'limmat',
    npm: 'limmat',
    output: 'dom',
    defaultConfig: '`createRenderer(container)` with no options, `write(chunk)` for every chunk and `end()` at the end (50 ms throttle).',
  },
  {
    id: 'streamdown',
    npm: 'streamdown',
    imports: '{ Streamdown }',
    output: 'react',
    defaultConfig:
      '`<Streamdown isAnimating={true}>` while text arrives and `isAnimating={false}` once the stream has ended, as its README shows, no plugins.',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    initialChunkOnly: true,
  },
  {
    id: 'streaming-markdown',
    npm: 'streaming-markdown',
    imports: '{ parser, default_renderer, parser_write, parser_end }',
    output: 'dom',
    defaultConfig: '`parser(default_renderer(container))`, `parser_write` for every chunk and `parser_end` at the end, no options.',
  },
  {
    id: 'markstream-vue',
    npm: 'markstream-vue',
    imports: '{ default as MarkdownRender }',
    output: 'vue',
    defaultConfig:
      '`<MarkdownRender mode="chat" :content="text so far" :final="done" :fade="false">`, with `final` set once the stream has ended, as its README shows for AI chat.',
    external: ['vue'],
    // katex, mermaid, d2, and the code-diff package are optional peers that its README says to install only when needed.
    optional: ['katex', 'katex/*', 'mermaid', '@terrastruct/d2', '@antv/infographic', 'stream-diffs', 'stream-diffs/*', 'vue-i18n'],
  },
  {
    id: 'svelte-markdown',
    npm: '@humanspeak/svelte-markdown',
    imports: '{ default as SvelteMarkdown }',
    output: 'svelte',
    defaultConfig: '`<SvelteMarkdown source="" streaming />` and `writeChunk(chunk)` for every chunk, as its README shows for streaming.',
    external: ['svelte', 'svelte/*'],
  },
  {
    id: 'tanstack-markdown',
    npm: '@tanstack/markdown',
    sizeSource:
      "export { Markdown } from '@tanstack/markdown/react'; export { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming';",
    output: 'react',
    defaultConfig:
      '`<Markdown extensions={[streamingMarkdownExtension()]} frontmatter={false} headingIds={false}>` with the text so far, as its AI streaming guide shows. It parses the whole text on every update.',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  // The two most used markdown libraries. Neither is built for streaming, so each write parses the whole text again, as their docs show.
  {
    id: 'react-markdown',
    npm: 'react-markdown',
    imports: '{ default as Markdown }',
    output: 'react',
    defaultConfig: '`<Markdown>{text so far}</Markdown>` rendered again on every write, no plugins, default `urlTransform`.',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  {
    id: 'marked',
    npm: 'marked',
    imports: '{ marked }',
    output: 'html-string',
    defaultConfig: '`container.innerHTML = marked.parse(text so far)` on every write, no options and no sanitizer.',
  },
];

// What a library needs to bundle beyond esbuild's defaults: Svelte components are compiled by esbuild-svelte, and Vue wants its build flags.
export async function extraBuild(t) {
  const out = { plugins: [], conditions: ['browser'], define: { 'process.env.NODE_ENV': '"production"' } };
  if (t.output === 'svelte') {
    const mod = await import(pathToFileURL(path.join(HERE, 'node_modules/esbuild-svelte/dist/index.mjs')).href);
    out.plugins.push(mod.default({ compilerOptions: { css: 'injected' }, filterWarnings: () => false }));
    // The package guards its debug code with Vite's `import.meta.env.DEV`, which a plain esbuild bundle does not define.
    Object.assign(out.define, {
      'import.meta.env.DEV': 'false',
      'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"production","SSR":false}',
    });
    out.conditions = ['svelte', 'browser']; // the package exports its components only under the svelte condition
  }
  if (t.output === 'vue')
    Object.assign(out.define, {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    });
  return out;
}

const pkgDir = (t) => (t.id === 'limmat' ? ROOT : path.join(HERE, 'node_modules', t.npm));
export const readPkg = (t) => JSON.parse(fs.readFileSync(path.join(pkgDir(t), 'package.json'), 'utf8'));
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
const day = (iso) => String(iso).slice(0, 10);

// Gzip level 9 of what a page loads first: the entry file plus the chunks it imports statically.
// React libraries leave react and react-dom out. Streamdown lazy-loads shiki and mermaid, and those are not counted.
async function gzipBytes(t) {
  const target = ['chrome86', 'firefox78', 'safari14.1'];
  const common = {
    bundle: true,
    format: 'esm',
    target,
    minify: true,
    write: false,
    legalComments: 'none',
    metafile: true,
    external: [...(t.external ?? []), ...(t.optional ?? [])],
  };
  const loaders = { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' };
  let r;
  if (t.id === 'limmat') {
    r = await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'src/index.ts')] });
    return gzipSync(r.outputFiles[0].contents, { level: 9 }).length;
  }
  const outdir = path.join(HERE, '.build', 'size', t.id);
  const extra = await extraBuild(t);
  r = await esbuild.build({
    ...common,
    stdin: { contents: t.sizeSource ?? `export ${t.imports} from '${t.npm}';`, resolveDir: HERE, loader: 'js' },
    outdir,
    splitting: Boolean(t.initialChunkOnly),
    define: extra.define,
    plugins: extra.plugins,
    loader: loaders,
    platform: 'browser',
    conditions: extra.conditions,
  });
  const files = new Map(r.outputFiles.map((f) => [path.relative(process.cwd(), f.path), f.contents]));
  const outs = r.metafile.outputs;
  const entry = Object.keys(outs).find((k) => outs[k].entryPoint !== undefined || Object.keys(outs).length === 1);
  const seen = new Set();
  const walk = (k) => {
    if (seen.has(k)) return;
    seen.add(k);
    for (const imp of outs[k].imports) if (imp.kind === 'import-statement' && outs[imp.path]) walk(imp.path);
  };
  walk(entry);
  let total = 0;
  for (const k of seen) total += gzipSync(files.get(k), { level: 9 }).length;
  return total;
}

function gzipNote(t) {
  if (t.id === 'limmat') return '`src/index.ts`, esbuild minify, same target as `scripts/size.mjs`';
  const excluded = { react: 'react and react-dom excluded', vue: 'vue excluded', svelte: 'svelte excluded' }[t.output];
  const base = excluded ?? 'quick-start import only, esbuild minify';
  if (t.optional) return `${base}, optional peers (katex, mermaid, and others) not counted`;
  return t.initialChunkOnly ? `${base}, initial chunks only, lazy-loaded shiki and mermaid not counted` : base;
}

export async function localMeta() {
  const out = {};
  for (const t of TOOLS) {
    const p = readPkg(t);
    const repoUrl = (typeof p.repository === 'string' ? p.repository : p.repository?.url) || '';
    const m = /github\.com[/:]([^/]+\/[^/.]+)/.exec(repoUrl) || /^([\w-]+\/[\w.-]+)$/.exec(repoUrl);
    const deps = { ...p.dependencies, ...p.peerDependencies };
    const framework = ['react', 'vue', 'svelte'].find((f) => f in deps) || 'none';
    out[t.id] = {
      id: t.id,
      npm: t.npm,
      version: p.version,
      versionLabel: t.id === 'limmat' ? `${p.version} (master)` : p.version,
      repo: m ? m[m.length - 1] : '',
      framework,
      output: t.output,
      directDeps: Object.keys(p.dependencies || {}).length,
      gzipBytes: await gzipBytes(t),
      gzipNote: gzipNote(t),
      defaultConfig: t.defaultConfig,
    };
  }
  return out;
}

// Counts the unique name@version pairs below the package in a clean install, leaving out its peers (react, react-dom, scheduler).
function totalDeps(t, version) {
  if (t.id === 'limmat') return 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limmat-compare-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"scratch","version":"0.0.0","private":true}');
    sh('npm', [
      'install',
      '--prefix',
      dir,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--omit=dev',
      '--no-package-lock',
      `${t.npm}@${version}`,
    ]);
    const tree = JSON.parse(sh('npm', ['ls', '--omit=dev', '--all', '--json', '--prefix', dir]));
    const peers = new Set(Object.keys(readPkg(t).peerDependencies || {}));
    const seen = new Set();
    const walk = (node, top) => {
      for (const [name, child] of Object.entries(node.dependencies || {})) {
        if (top && peers.has(name)) continue;
        const k = `${name}@${child.version}`;
        if (seen.has(k)) continue;
        seen.add(k);
        walk(child, false);
      }
    };
    walk(tree.dependencies[t.npm], false);
    return seen.size;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function networkMeta(local) {
  const out = {};
  for (const t of TOOLS) {
    const l = local[t.id];
    const time = JSON.parse(sh('npm', ['view', t.npm, 'time', '--json']));
    if (!time[l.version]) throw new Error(`${t.npm}@${l.version} is not on npm`);
    // time.created, not the earliest version: the npm name "streamdown" holds versions from 2020 that belong to an unrelated, older package.
    const first = time.created;
    let lastCommit;
    if (t.id === 'limmat') lastCommit = sh('git', ['log', '-1', '--format=%cs'], { cwd: ROOT });
    else lastCommit = day(sh('gh', ['api', `repos/${l.repo}/commits?per_page=1`, '--jq', '.[0].commit.committer.date']));
    out[t.id] = { releaseDate: day(time[l.version]), firstRelease: day(first), lastCommit, totalDeps: totalDeps(t, l.version) };
  }
  return out;
}
