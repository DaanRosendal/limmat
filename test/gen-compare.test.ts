import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error a plain .mjs script with no declaration
import { END, lint, locate, render, START, validate } from '../scripts/gen-compare.mjs';

// The generator behind the README comparison table. It must never fail because the data is old, and it must render only from fixed
// wording plus validated values. These tests use small inline results, not benchmarks/compare/results.json.
const data = JSON.parse(readFileSync('docs/compare.json', 'utf8'));

const pass = { result: 'pass', detail: 'free text that must never be rendered' };
const tool = (id: string, over: Record<string, unknown> = {}, probes: Record<string, unknown> = {}) => ({
  id,
  npm: id,
  version: '1.2.3',
  versionLabel: '1.2.3',
  repo: `owner/${id}`,
  releaseDate: '2026-10-01',
  firstRelease: '2025-01-02',
  lastCommit: '2026-11-10',
  framework: 'none',
  output: 'dom',
  directDeps: 0,
  totalDeps: 0,
  gzipBytes: 10460,
  gzipNote: 'core, no deps',
  defaultConfig: `The default configuration of ${id}.`,
  probes: {
    'p1-raw-html': pass,
    'p2-link-schemes': pass,
    'p3-remote-html': pass,
    'p4-remote-md-image': pass,
    'p5-link-target': pass,
    'p6-markers': { result: 'pass', leaked: 0, constructs: 20, detail: 'x' },
    'p7-commonmark': { result: 'info', passed: 385, total: 652, strict: 300, textOnly: 385 },
    ...probes,
  },
  ...over,
});
const make = () => ({
  schema: 1,
  checkedOn: '2026-11-21',
  environment: { node: '22.22.2', playwright: '1.60.0', chromium: '140.0.7339.16' },
  tools: [
    tool('limmat', { version: '0.2.0', versionLabel: '0.2.0' }, { 'p4-remote-md-image': { result: 'fail', detail: 'x' } }),
    tool('streaming-markdown', { gzipBytes: 3100 }),
    tool('streamdown', { framework: 'react', output: 'react', directDeps: 15, totalDeps: 117, gzipBytes: 51200 }),
    tool(
      'markstream-vue',
      { framework: 'vue', output: 'vue' },
      { 'p1-raw-html': { result: 'fail', detail: 'x' }, 'p6-markers': { result: 'fail', leaked: 12, constructs: 20 } },
    ),
    tool('svelte-markdown', { framework: 'svelte', output: 'svelte', directDeps: 3, totalDeps: 40 }),
    tool('tanstack-markdown', { framework: 'react', output: 'react' }),
  ],
});
type Results = ReturnType<typeof make>;

// The tools in make() are in the order of docs/compare.json, so tools[i] is the library in column i of the table.
const rowOf = (text: string, label: string) => text.split('\n').find((l) => l.startsWith(`| ${label} |`)) ?? '';
// The first collapsed block ("Why these marks"), without its tags.
const whyBlock = (text: string) => text.slice(text.indexOf('<details>'), text.indexOf('</details>'));
// A bullet in that block, found by the start of its text without the bullet.
const bullet = (text: string, start: string) =>
  whyBlock(text)
    .split('\n')
    .find((l) => l.startsWith(`- ${start}`)) ?? '';
const cellsOf = (text: string, label: string) =>
  rowOf(text, label)
    .split('|')
    .slice(2, -1)
    .map((c) => c.trim());

afterEach(() => vi.useRealTimers());

describe('compare table: render', () => {
  const out: string = render(make(), data);

  it('escapes markup and table characters in free text from results.json', () => {
    const r = make();
    r.tools[0].gzipNote = '<b>x</b> | y_z';
    r.tools[0].defaultConfig = '<Tag a="1"> | `code` *x*';
    const text: string = render(r, data);
    expect(text).not.toMatch(/(^|[^\\])<(b>|Tag)/);
    expect(text).toContain('\\<b\\>x\\</b\\> \\| y\\_z');
    expect(lint(text)).toEqual([]);
  });

  it('wraps the table in the markers and puts limmat first, with plain linked names as the header', () => {
    expect(out.startsWith(START)).toBe(true);
    expect(out.endsWith(END)).toBe(true);
    const header = out.split('\n').find((l) => l.startsWith('| Compared on |')) ?? '';
    expect(header.indexOf('[limmat]')).toBeLessThan(header.indexOf('[streaming-markdown]'));
    expect(
      header
        .split('|')
        .slice(2, -1)
        .map((c) => c.trim()),
    ).toEqual([
      '[limmat](https://github.com/DaanRosendal/limmat#readme)',
      '[streaming-markdown](https://github.com/thetarnav/streaming-markdown#readme)',
      '[Streamdown](https://github.com/vercel/streamdown#readme)',
      '[markstream-vue](https://github.com/Simon-He95/markstream-vue#readme)',
      '[svelte-markdown](https://github.com/humanspeak/svelte-markdown#readme)',
      '[TanStack Markdown](https://github.com/TanStack/markdown#readme)',
    ]);
    expect(header).not.toContain('<br>');
    expect(header).not.toContain('0.2.0');
  });

  it('has the seven rows in order, and keeps one details block after the table', () => {
    const lines = out.split('\n');
    const head = lines.findIndex((l) => l.startsWith('| Compared on |'));
    const labels = lines.slice(head + 2, head + 9).map((l) => l.split('|')[1].trim());
    expect(labels).toEqual([
      'No framework needed',
      'Runtime dependencies',
      'Safe by default',
      'No raw markers while streaming',
      'CommonMark examples passed',
      'Size (gzip)',
      'Last release',
    ]);
    expect(lines[head + 9]).toBe('');
    expect(lines[head + 10].startsWith('Checked on ')).toBe(true);
    const opens = lines.flatMap((l, i) => (l === '<details>' ? [i] : []));
    const closes = lines.flatMap((l, i) => (l === '</details>' ? [i] : []));
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    expect(lines[opens[0] + 1]).toBe('<summary>How this was measured</summary>');
    const inside = lines.slice(opens[0], closes[0]).join('\n');
    expect(inside).toContain('- Rules: ');
    expect(inside).toContain('Versions: ');
    expect(inside).toContain(
      '- limmat 0.2.0: The default configuration of limmat. Size: core, no deps. ([docs](https://github.com/DaanRosendal/limmat#readme))',
    );
  });

  it('keeps `code spans` in free text literal and escapes the text around them', () => {
    const r = make();
    r.tools[0].defaultConfig = '`<Tag a={1}>` while <b>text</b> arrives.';
    const text: string = render(r, data);
    expect(text).toContain('`<Tag a={1}>` while \\<b\\>text\\</b\\> arrives.');
  });

  it('shows the framework as a check mark or a cross with the framework name', () => {
    expect(cellsOf(out, 'No framework needed')).toEqual(['✅', '✅', '❌ React', '❌ Vue', '❌ Svelte', '❌ React']);
  });

  it('marks dependencies by the total only: none, 1 to 5, more', () => {
    expect(cellsOf(out, 'Runtime dependencies')).toEqual(['✅ 0', '✅ 0', '❌ 117', '✅ 0', '❌ 40', '✅ 0']);
    const r = make();
    Object.assign(r.tools[1], { directDeps: 1, totalDeps: 1 });
    Object.assign(r.tools[2], { directDeps: 2, totalDeps: 5 });
    Object.assign(r.tools[3], { directDeps: 2, totalDeps: 6 });
    Object.assign(r.tools[4], { directDeps: 0, totalDeps: 0 });
    expect(cellsOf(render(r, data), 'Runtime dependencies').slice(1)).toEqual(['⚠️ 1', '⚠️ 5', '❌ 6', '✅ 0', '✅ 0']);
  });

  it('shows the size in kB with one decimal and nothing else', () => {
    expect(cellsOf(out, 'Size (gzip)')).toEqual(['10.5 kB', '3.1 kB', '51.2 kB', '10.5 kB', '10.5 kB', '10.5 kB']);
  });

  it('derives the safe row from p1 and p2 as a mark only', () => {
    const r = make();
    r.tools[1].probes['p2-link-schemes'] = { result: 'partial', detail: 'x' };
    r.tools[2].probes['p1-raw-html'] = { result: 'fail', detail: 'x' };
    r.tools[2].probes['p2-link-schemes'] = { result: 'fail', detail: 'x' };
    r.tools[3].probes['p1-raw-html'] = { result: 'partial', detail: 'x' };
    r.tools[4].probes['p2-link-schemes'] = { result: 'error', detail: 'x' };
    expect(cellsOf(render(r, data), 'Safe by default')).toEqual(['✅', '⚠️', '❌', '⚠️', '⚠️', '✅']);
    // A fail in one probe wins over a partial in the other.
    r.tools[0].probes['p1-raw-html'] = { result: 'partial', detail: 'x' };
    r.tools[0].probes['p2-link-schemes'] = { result: 'fail', detail: 'x' };
    expect(cellsOf(render(r, data), 'Safe by default')[0]).toBe('❌');
  });

  it('marks raw markers as a mark only, from the p6 result', () => {
    expect(cellsOf(out, 'No raw markers while streaming')).toEqual(['✅', '✅', '✅', '❌', '✅', '✅']);
  });

  it('marks CommonMark at 50 and 80 percent exactly as the footnote says', () => {
    const r = make();
    const set = (i: number, passed: number) => Object.assign(r.tools[i].probes['p7-commonmark'], { passed, total: 100 });
    set(0, 50);
    set(1, 80);
    set(2, 81);
    set(3, 49);
    expect(cellsOf(render(r, data), 'CommonMark examples passed').slice(0, 4)).toEqual(['⚠️ 50%', '⚠️ 80%', '✅ 81%', '❌ 49%']);
    expect(cellsOf(out, 'CommonMark examples passed')[0]).toBe('⚠️ 59%');
  });

  it('shows the release as a month and bolds it only when it is over a year before checkedOn', () => {
    const r = make();
    Object.assign(r.tools[0], { releaseDate: '2026-08-21' });
    Object.assign(r.tools[1], { releaseDate: '2026-08-22' });
    Object.assign(r.tools[2], { releaseDate: '2025-11-22' }); // one day short of a year: not bold
    Object.assign(r.tools[3], { releaseDate: '2025-11-21' }); // exactly a year: bold
    Object.assign(r.tools[4], { releaseDate: '2024-01-05' });
    expect(cellsOf(render(r, data), 'Last release')).toEqual([
      'Aug&nbsp;2026',
      'Aug&nbsp;2026',
      'Nov&nbsp;2025',
      '**Nov&nbsp;2025**',
      '**Jan&nbsp;2024**',
      'Oct&nbsp;2026',
    ]);
    expect(cellsOf(out, 'Last release')).toEqual([
      'Oct&nbsp;2026',
      'Oct&nbsp;2026',
      'Oct&nbsp;2026',
      'Oct&nbsp;2026',
      'Oct&nbsp;2026',
      'Oct&nbsp;2026',
    ]);
  });

  it('never prints a probe detail string', () => {
    expect(out).not.toContain('free text that must never be rendered');
  });

  it('lists the reasons, marker counts, and remote loads in the bullets under the table', () => {
    expect(bullet(out, 'Safe by default:')).toBe('- Safe by default: markstream-vue ran a script.');
    expect(bullet(out, 'Raw markers while streaming:')).toBe(
      `- Raw markers while streaming: markstream-vue 12 of 20 constructs. ${data.details.markersNote}`,
    );
    expect(bullet(out, 'Remote loads:')).toBe(
      `- Remote loads: Remote markdown images load without a click in limmat. ${data.details.limmatImages}`,
    );
  });

  it('names the reasons from the probe result enums only, for each library that does not pass', () => {
    const r = make();
    r.tools[1].probes['p2-link-schemes'] = { result: 'partial', detail: 'free text that must never be rendered' };
    r.tools[3].probes['p2-link-schemes'] = { result: 'fail', detail: 'x' };
    r.tools[4].probes['p1-raw-html'] = { result: 'error', detail: 'x' };
    expect(bullet(render(r, data), 'Safe by default:')).toBe(
      '- Safe by default: streaming-markdown kept some unsafe link schemes. markstream-vue ran a script and kept an unsafe link scheme. svelte-markdown could not be tested.',
    );
  });

  it('writes the and-list for one, two, and three libraries, and says every library when all of them fail', () => {
    const leak = (ids: number[]) => {
      const r = make();
      for (const t of r.tools) Object.assign(t.probes['p6-markers'], { result: 'pass', leaked: 0 });
      for (const i of ids) Object.assign(r.tools[i].probes['p6-markers'], { result: 'partial', leaked: i + 1 });
      return render(r, data);
    };
    const tail = ` ${data.details.markersNote}`;
    const own = ` ${data.details.markersNotes.streamdown}`;
    expect(bullet(leak([3]), 'Raw markers')).toBe(`- Raw markers while streaming: markstream-vue 4 of 20 constructs.${tail}`);
    expect(bullet(leak([2, 3]), 'Raw markers')).toBe(
      `- Raw markers while streaming: Streamdown 3 of 20 constructs and markstream-vue 4 of 20 constructs.${tail}${own}`,
    );
    expect(bullet(leak([2, 3, 4]), 'Raw markers')).toBe(
      `- Raw markers while streaming: Streamdown 3 of 20 constructs, markstream-vue 4 of 20 constructs, and svelte-markdown 5 of 20 constructs.${tail}${own}`,
    );
    expect(bullet(leak([]), 'Raw markers')).toBe('');

    const img = (ids: number[], html: number[] = []) => {
      const r = make();
      for (const t of r.tools) Object.assign(t.probes, { 'p4-remote-md-image': pass, 'p3-remote-html': pass });
      for (const i of ids) r.tools[i].probes['p4-remote-md-image'] = { result: 'fail', detail: 'x' };
      for (const i of html) r.tools[i].probes['p3-remote-html'] = { result: 'fail', detail: 'x' };
      return bullet(render(r, data), 'Remote loads:');
    };
    expect(img([3])).toBe('- Remote loads: Remote markdown images load without a click in markstream-vue.');
    expect(img([2, 3])).toBe('- Remote loads: Remote markdown images load without a click in Streamdown and markstream-vue.');
    expect(img([2, 3, 4])).toBe(
      '- Remote loads: Remote markdown images load without a click in Streamdown, markstream-vue, and svelte-markdown.',
    );
    expect(img([0, 1, 2, 3, 4, 5])).toBe(
      `- Remote loads: Every library loads a remote markdown image without a click. ${data.details.limmatImages}`,
    );
    expect(img([2], [2, 3])).toBe(
      '- Remote loads: Remote markdown images load without a click in Streamdown. Raw HTML images also load in Streamdown and markstream-vue.',
    );
    expect(img([])).toBe('');
  });

  it('leaves out the bullets that have nothing to say, and says the not-every-library case in words', () => {
    const r = make();
    for (const t of r.tools) {
      Object.assign(t.probes, { 'p1-raw-html': pass, 'p4-remote-md-image': pass });
      Object.assign(t.probes['p6-markers'], { result: 'pass', leaked: 0 });
    }
    const quiet = render(r, data);
    const top = whyBlock(quiet);
    expect(top).not.toContain('- Safe by default:');
    expect(top).not.toContain('- Raw markers while streaming:');
    expect(top).not.toContain('- Remote loads:');
    // Only some libraries fail the image probe: the wording must not claim that every library does.
    r.tools[1].probes['p4-remote-md-image'] = { result: 'fail', detail: 'x' };
    const some = bullet(render(r, data), 'Remote loads:');
    expect(some).toContain('Remote markdown images load without a click in streaming-markdown.');
    expect(some).not.toContain('Every library');
    // The limmat sentence is only added while limmat is among the libraries that fail.
    expect(some).not.toContain(data.details.limmatImages);
  });

  it('fills the intro, versions line, and the limmat numbers', () => {
    expect(out).toContain('Checked on 2026-11-21 against the latest releases, each in its default quick-start setup (');
    expect(out).toContain(
      'Versions: limmat 0.2.0, streaming-markdown 1.2.3, Streamdown 1.2.3, markstream-vue 1.2.3, svelte-markdown 1.2.3, TanStack Markdown 1.2.3. Node 22.22.2, Playwright 1.60.0, Chromium 140.0.7339.16.',
    );
    expect(out).toContain('[probes and raw results](https://github.com/DaanRosendal/limmat/blob/master/benchmarks/compare/README.md)');
    expect(out).toContain('Open an issue or pull request if something is wrong or out of date.');
    expect(out).toContain('https://github.com/DaanRosendal/limmat/blob/master/benchmarks/compare/README.md');
  });

  it('is deterministic and passes its own lint (no dashes, placeholders, or empty cells)', () => {
    expect(render(make(), data)).toBe(out);
    expect(lint(out)).toEqual([]);
  });
});

describe('compare table: validate', () => {
  it('accepts well-formed data', () => {
    expect(validate(make(), data)).toEqual([]);
  });

  const broken: [string, (r: Results) => void, RegExp][] = [
    ['an invalid calendar date', (r) => (r.checkedOn = '2026-02-31'), /checkedOn/],
    ['a tool that docs/compare.json does not know', (r) => r.tools.push(tool('newlib') as never), /newlib: not in docs\/compare.json/],
    ['a missing limmat', (r) => (r.tools = r.tools.filter((t) => t.id !== 'limmat')), /limmat is missing/],
    ['a version that is not semver', (r) => (r.tools[1].version = 'latest'), /version must be semver/],
    ['a float where an integer belongs', (r) => (r.tools[1].gzipBytes = 10.5), /gzipBytes/],
    [
      'more leaked markers than constructs',
      (r) => Object.assign(r.tools[0].probes['p6-markers'], { leaked: 30 }),
      /leaked is more than constructs/,
    ],
    ['a probe result outside the enum', (r) => (r.tools[0].probes['p1-raw-html'] = { result: 'ok', detail: '' }), /p1-raw-html.result/],
    ['a missing probe', (r) => delete (r.tools[0].probes as Record<string, unknown>)['p5-link-target'], /p5-link-target is missing/],
    ['a gzip note with non-ASCII text', (r) => (r.tools[0].gzipNote = 'caf\u00e9'), /gzipNote/],
    ['a default config with a newline', (r) => (r.tools[0].defaultConfig = 'a\nb'), /defaultConfig/],
    ['a framework with no display name', (r) => (r.tools[1].framework = 'qwik'), /qwik/],
    ['an unsupported schema', (r) => (r.schema = 2), /schema must be 1/],
  ];
  for (const [name, mutate, re] of broken) {
    it(`rejects ${name}`, () => {
      const r = make();
      mutate(r);
      expect(validate(r, data).join('\n')).toMatch(re);
    });
  }

  it('rejects a probe without a source URL and accepts the usual shapes of probes.json', () => {
    const ok = [{ id: 'p1-raw-html', source: 'https://example.com/a' }];
    expect(validate(make(), data, ok)).toEqual([]);
    expect(validate(make(), data, { probes: ok })).toEqual([]);
    expect(validate(make(), data, { 'p1-raw-html': { source: 'https://example.com/a' } })).toEqual([]);
    expect(validate(make(), data, [{ id: 'p1-raw-html' }]).join('\n')).toMatch(/p1-raw-html has no https source URL/);
    expect(validate(make(), data, [{ id: 'p2', source: 'http://example.com' }]).join('\n')).toMatch(/p2 has no https source URL/);
  });

  it('rejects manual data with an empty or oddly shaped field', () => {
    const d = structuredClone(data);
    d.rows.safe = '';
    d.frameworkNames.react = 'has | a pipe';
    d.tools['markstream-vue'].docs = 'javascript:alert(1)';
    const msg = validate(make(), d).join('\n');
    expect(msg).toMatch(/rows.safe/);
    expect(msg).toMatch(/frameworkNames.react/);
    expect(msg).toMatch(/tools.markstream-vue.docs/);
  });
});

describe('compare table: lint', () => {
  const dash = String.fromCharCode(0x2014);
  it('flags dashes, placeholder words, empty cells, and a lone question mark', () => {
    expect(lint(`a ${dash} b`)).toHaveLength(1);
    expect(lint('Value is TODO')).toHaveLength(1);
    expect(lint('the UNVERIFIED claim')).toHaveLength(1);
    expect(lint('| a | |')).toHaveLength(1);
    expect(lint('| a | ? |')).toHaveLength(1);
    expect(lint('| a | - |')).toHaveLength(1);
    expect(lint('so ? maybe')).toHaveLength(1);
  });
  it('allows a question mark that ends a sentence and plain hyphens', () => {
    expect(lint('Wrong or out of date? Open an issue.')).toEqual([]);
    expect(lint('| a-b | ✅ yes |')).toEqual([]);
  });
});

describe('compare table: old data never fails', () => {
  it('validates and renders the same no matter what today is', () => {
    const r = make();
    r.checkedOn = '2020-01-15';
    for (const t of r.tools) Object.assign(t, { releaseDate: '2019-12-01', lastCommit: '2019-12-30' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-16T00:00:00Z'));
    const before = render(r, data);
    expect(validate(r, data)).toEqual([]);
    vi.setSystemTime(new Date('2099-06-01T00:00:00Z'));
    expect(validate(r, data)).toEqual([]);
    expect(render(r, data)).toBe(before);
    expect(lint(before)).toEqual([]);
    expect(cellsOf(before, 'Last release')[0]).toBe('Dec&nbsp;2019');
  });

  it('does not read the clock in the generator', () => {
    const src = readFileSync('scripts/gen-compare.mjs', 'utf8');
    expect(src).not.toMatch(/Date\.now\(|new Date\(\)|performance\.now/);
  });
});

describe('compare table: README markers', () => {
  it('finds the section, reports none, and rejects half a pair', () => {
    const text = `a\n${START}\nold\n${END}\nb`;
    const span = locate(text);
    expect(text.slice(span[0], span[1])).toBe(`${START}\nold\n${END}`);
    expect(locate('no markers here')).toBeNull();
    expect(() => locate(`${START}\nonly start`)).toThrow();
    expect(() => locate(`${END}\n${START}`)).toThrow();
  });
});

describe('compare table: command line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'limmat-compare-'));
  const results = join(dir, 'results.json');
  const readme = join(dir, 'README.md');
  writeFileSync(results, JSON.stringify(make()));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/gen-compare.mjs', readme, `--results=${results}`, '--probes=none', ...args], {
      encoding: 'utf8',
    });

  it('passes --check with a clear message while the README has no markers', () => {
    writeFileSync(readme, '# Title\n\nSome text.\n');
    const r = run('--check');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('no compare markers yet');
  });

  it('refuses to write without markers, then writes and checks the section', () => {
    writeFileSync(readme, '# Title\n');
    expect(run().status).toBe(1);
    writeFileSync(readme, `# Title\n\n${START}\nstale\n${END}\n\nafter\n`);
    expect(run('--check').status).toBe(1);
    expect(run().status).toBe(0);
    expect(run('--check').status).toBe(0);
    const text = readFileSync(readme, 'utf8');
    expect(text.startsWith('# Title\n\n')).toBe(true);
    expect(text.endsWith(`${END}\n\nafter\n`)).toBe(true);
    expect(text).toContain('| Runtime dependencies |');
  });

  it('fails --check when the README table was edited by hand', () => {
    writeFileSync(readme, readFileSync(readme, 'utf8').replace('Runtime dependencies', 'Runtime deps'));
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('out of date');
  });

  it('fails --check on invalid results, but not on results from long ago', () => {
    const old = make();
    old.checkedOn = '2001-01-01';
    writeFileSync(results, JSON.stringify(old));
    writeFileSync(readme, '# Title\n');
    expect(run('--check').status).toBe(0);
    old.tools[0].gzipBytes = -1;
    writeFileSync(results, JSON.stringify(old));
    expect(run('--check').status).toBe(1);
  });
});

describe('compare table: prose rules', () => {
  it('flags a semicolon in prose but not in a code span or an HTML entity', () => {
    expect(lint('Some text; more text')).toEqual(['output line 1: semicolon in prose']);
    expect(lint('Use `a; b` here and &nbsp; there')).toEqual([]);
  });
});
