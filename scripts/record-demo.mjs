// Records the Showcase stream of the built demo as a looping GIF (run `npm run build && npm run build:demo` first).
//   npm run record                       docs/demo-light.gif and docs/demo-dark.gif (not in git: upload them to the `media` release)
//   npm run record -- theme=dark         only docs/demo-dark.gif
//   options: theme=light|dark (both when left out)  seed=1  size=3  speed=42  throttle=0  fps=24  width=1080  dsf=2  colors=256  lossy=0  chunks=0|1  bg=#ffffff  view=900x900  out=docs/demo-light.gif  frames=<dir to keep the PNG frames in>
//
// The recording is reproducible: the page runs on Playwright's virtual clock, so every timer, throttle, and animation
// frame advances by exactly one frame interval between screenshots, and the chunk cuts come from the seed in the URL.
// Two runs give nearly the same frames: the async highlighter and rounded corners can differ by a few pixels.
// It needs ffmpeg on the PATH, and it fails if the page makes an off-site request, breaks its CSP, or throws.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { headers, ROOT, typeOf } from './demo-files.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));

if (!opt.theme && !opt.out) {
  // No theme asked for: record both, one run each (the options carry over).
  for (const theme of ['light', 'dark']) {
    const r = spawnSync(process.execPath, [process.argv[1], `theme=${theme}`, ...process.argv.slice(2)], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  process.exit(0);
}
const theme = opt.theme === 'dark' ? 'dark' : 'light';
const seed = Number(opt.seed ?? 1);
const size = Number(opt.size ?? 3); // characters per chunk (random 1 to size), so the stream plays in about 24 seconds
const speed = Number(opt.speed ?? 42); // ms between chunks (42 shows as 24/s in the demo)
const throttle = Number(opt.throttle ?? 0); // the renderer's throttleMs
const fps = Number(opt.fps ?? 24); // the same as the 24 chunks per second, so each frame adds one character
const width = Number(opt.width ?? 1080);
const colors = Number(opt.colors ?? 256); // the most a GIF holds, so the text edges stay clean
const lossy = Number(opt.lossy ?? 0); // gifsicle's lossy level: 0 is lossless, and 40 or more adds visible artifacts
const dsf = Number(opt.dsf ?? 2); // device scale factor: the page renders at 2x, and the frames are scaled to `width`
const bg = opt.bg ?? (theme === 'dark' ? '#0d1117' : '#ffffff'); // the page background, set to GitHub's own so the GIF blends into the README
const marks = opt.chunks === '1' ? 1 : 0; // the chunk tint in the raw pane, off in the recording unless chunks=1
const [vw, vh] = (opt.view ?? '900x900').split('x').map(Number);
const out = opt.out ?? `docs/demo-${theme}.gif`;
const HOLD_START = 1; // seconds on the empty page before it starts
const HOLD_END = 3; // seconds on the finished page
const FADE = 0.8; // seconds of crossfade from the last frame back to the first, so the loop has no jump
const MAX_SECONDS = 150;

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('record-demo needs ffmpeg on the PATH (brew install ffmpeg).');
  process.exit(1);
}

const problems = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: theme, deviceScaleFactor: dsf });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('request', (r) => !r.url().startsWith('https://limmat.test/') && problems.push(`off-site request: ${r.url()}`));
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => (window.__csp ||= []).push(`${e.violatedDirective} ${e.blockedURI}`));
});
await page.route('https://limmat.test/**', (route) => {
  const path = new URL(route.request().url()).pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  try {
    return route.fulfill({
      contentType: typeOf(file),
      headers,
      body: readFileSync(ROOT + file),
    });
  } catch {
    return route.fulfill({ status: 404, body: 'not found' });
  }
});

await page.clock.install();
await page.goto(`https://limmat.test/#v=1&stream=showcase&c=${size}&r=1&k=${marks}&s=${seed}&t=${throttle}&d=${speed}`);
await page.waitForFunction(() => window.__demoReady === true);
// Stop CSS animations (the blinking caret, the pulse on the open chip) without touching the CSP: the page reads
// prefers-reduced-motion once, at load, so changing it now only switches the animations off and the stream keeps playing.
await page.emulateMedia({ reducedMotion: 'reduce' });
// The CSSOM is allowed under the strict style-src, so the background can change without a style attribute or a CSP bypass.
await page.evaluate((color) => document.documentElement.style.setProperty('--bg', color), bg);
await page.clock.pauseAt(Date.now() + 3_600_000);
await page.click('#restart'); // a known start: empty panes, chunk 0
await page.mouse.move(0, 0);
const box = await page.locator('.stage').boundingBox();
const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) };

const dir = opt.frames ? resolve(opt.frames) : mkdtempSync(join(tmpdir(), 'limmat-record-'));
mkdirSync(dir, { recursive: true });
const frame = (n) => join(dir, `f${String(n).padStart(4, '0')}.png`);
const step = 1000 / fps;
let n = 0;
const shoot = async () => writeFileSync(frame(n++), await page.screenshot({ clip, type: 'png' }));
await page.evaluate(() => (document.querySelector('#out').scrollTop = 0));
await shoot();
// Mid-stream the page keeps going on its own timers, so each step advances the virtual clock and nothing else.
while (n < MAX_SECONDS * fps) {
  await page.clock.runFor(step);
  await page.waitForTimeout(15); // lets the highlighter finish its async work, which the virtual clock does not drive
  await shoot();
  if ((await page.locator('#play').textContent()) === 'Replay') break;
}
const csp = await page.evaluate(() => window.__csp ?? []);
await browser.close();

const seconds = n / fps;
if (n >= MAX_SECONDS * fps) problems.push(`the stream did not finish within ${MAX_SECONDS} seconds`);
if (csp.length) problems.push(`CSP violations: ${csp.join(', ')}`);
if (problems.length) {
  console.error(`not writing ${out}:\n${problems.join('\n')}`);
  if (!opt.frames) rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

// Hold the empty page, play the stream, hold the finished page, then fade the last frame into the first.
// Three ffmpeg passes: lay the timeline out as PNG frames, build one palette from all of them, then write the GIF.
// (One filter graph that does all three drops most of the stream, so the passes stay separate.)
const first = frame(0);
const last = frame(n - 1);
const seq = join(dir, 'seq');
mkdirSync(seq, { recursive: true });
const norm = `scale=${width}:-1:flags=lanczos,format=rgb24,settb=AVTB,fps=${fps}`;
const timeline = [
  `[0:v]${norm},tpad=start_mode=clone:start_duration=${HOLD_START}:stop_mode=clone:stop_duration=${HOLD_END}[main]`,
  `[1:v]${norm}[a]`,
  `[2:v]${norm}[b]`,
  `[a][b]xfade=transition=fade:duration=${FADE}:offset=0[fade]`,
  '[main][fade]concat=n=2:v=1:a=0',
].join(';');
const loopInput = (file) => ['-loop', '1', '-framerate', String(fps), '-t', String(FADE), '-i', file];
const ffmpeg = (...args) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
};
mkdirSync(dirname(resolve(out)), { recursive: true });
const palette = join(dir, 'palette.png');
ffmpeg(
  '-framerate',
  String(fps),
  '-i',
  join(dir, 'f%04d.png'),
  ...loopInput(last),
  ...loopInput(first),
  '-filter_complex',
  timeline,
  '-fps_mode',
  'cfr',
  join(seq, 's%04d.png'),
);
ffmpeg('-framerate', String(fps), '-i', join(seq, 's%04d.png'), '-vf', `palettegen=max_colors=${colors}:stats_mode=diff`, palette);
ffmpeg(
  '-framerate',
  String(fps),
  '-i',
  join(seq, 's%04d.png'),
  '-i',
  palette,
  '-lavfi',
  'paletteuse=dither=none:diff_mode=rectangle',
  '-loop',
  '0',
  out,
);
if (!opt.frames) rmSync(dir, { recursive: true, force: true });
const g = spawnSync('gifsicle', ['-O3', '--no-warnings', ...(lossy > 0 ? [`--lossy=${lossy}`] : []), out, '-o', out], { encoding: 'utf8' });
if (g.status !== 0) console.warn('gifsicle is missing or failed (brew install gifsicle), so the GIF is not compressed further.');
if (statSync(out).size >= 5_000_000)
  console.warn('This GIF is over 5 MB, and GitHub may not show it in the README. Use a lower width, fewer colors, or a faster speed.');
console.log(`wrote ${out}: ${seconds.toFixed(1)} s of stream, ${(statSync(out).size / 1e6).toFixed(2)} MB, ${theme}, seed ${seed}`);
