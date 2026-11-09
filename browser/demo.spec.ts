import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, open, test } from './demo-fixture';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const STREAMS = ['reply', 'tour', 'mid-marker', 'link-split', 'table', 'fence', 'list', 'long'];

test('loads with no errors, no CSP violations, and only same-origin requests', async ({ page, seen }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('never shows a half-finished marker');
  expect(seen.errors).toEqual([]);
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  const foreign = seen.requests.filter((u) => !u.startsWith('https://limmat.test/'));
  expect(foreign).toEqual([]);
  expect(seen.requests.length).toBeLessThan(25);
});

test('the page has no inline script, no inline style attribute, and sets no cookie or storage', async ({ page }) => {
  await open(page);
  const found = await page.evaluate(() => ({
    inlineScripts: Array.from(document.scripts).filter((s) => !s.src).length,
    styleAttrs: document.querySelectorAll('[style]').length,
    cookie: document.cookie,
    storage: localStorage.length + sessionStorage.length,
  }));
  expect(found).toEqual({ inlineScripts: 0, styleAttrs: 0, cookie: '', storage: 0 });
});

test('every stream ends with the same HTML for every chunking (the check on the page)', async ({ page }) => {
  await open(page);
  for (const name of STREAMS) {
    await page.selectOption('#stream', name);
    await page.click('#finish');
    await page.click('#run-check');
    await expect(page.locator('#check-verdict')).toHaveClass(/ok/);
  }
});

test('the open block readout names the construct that is still open', async ({ page }) => {
  await open(page);
  await page.selectOption('#stream', 'table');
  await page.click('#play'); // pause (autoplay started)
  await page.click('#restart');
  await page.click('#play'); // pause again right after restart
  await page.click('#step');
  await page.click('#step');
  await expect(page.locator('#open-readout')).toContainText('table');
  await page.click('#finish');
  await expect(page.locator('#open-readout')).toContainText('Done');
  await expect(page.locator('#out .is-open')).toHaveCount(0);
});

test('the scrubber rebuilds the output at a position and stays paused', async ({ page }) => {
  await open(page);
  await page.selectOption('#stream', 'fence');
  await page.fill('#pos', '2');
  await expect(page.locator('#pos-out')).toHaveText('2 / 4');
  await expect(page.locator('#play')).toHaveText('Play');
  expect(await page.locator('#raw').textContent()).toBe('``' + '`ts\nlet a = 1;\n');
  await expect(page.locator('#out .limmat-code')).toHaveCount(1);
  await expect(page.locator('#out code')).toContainText('let a = 1;');
});

test('the hostile gallery runs nothing, loads nothing, and the captions match reality', async ({ page, seen }) => {
  await open(page);
  const cards = page.locator('#cards .card');
  await expect(cards).toHaveCount(12);
  const proof = await page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll('#proof div'), (d) => [
        d.querySelector('dt')!.textContent,
        Number(d.querySelector('dd')!.textContent),
      ]),
    ),
  );
  expect(proof).toEqual({
    'Script elements in output': 0,
    'Image elements in output': 0,
    'Event-handler attributes': 0,
    'Links to javascript:, data:, or vbscript:': 0,
    'Links created': 1,
    'Image requests this page made': 0,
    'alert() calls from payloads': 0,
  });
  // The one link that exists is the safe one, and clicking links never leaves the page.
  const hrefs = await page.$$eval('#cards a', (as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual(['https://ok.com']);
  await page.evaluate(() => {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#cards a')) a.click();
  });
  expect(page.url()).toBe('https://limmat.test/');
  // Nested quotes are capped, and the fence language became a plain label.
  expect(await cards.nth(10).locator('.result blockquote').count()).toBeLessThan(20);
  await expect(cards.nth(11).locator('.result .limmat-lang')).toHaveText('a');
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.requests.filter((u) => !u.startsWith('https://limmat.test/'))).toEqual([]);
});

test('a shared link restores the settings and plays the same chunks', async ({ page }) => {
  await open(page, '#v=1&stream=table&c=3&r=0&s=7&t=0&d=10');
  await expect(page.locator('#stream')).toHaveValue('table');
  await page.click('#finish');
  await expect(page.locator('#out table')).toHaveCount(1);
  await page.selectOption('#stream', 'reply');
  await page.fill('#seed', '5');
  await page.locator('#seed').dispatchEvent('change');
  expect(page.url()).toContain('stream=reply');
  expect(page.url()).toContain('s=5');
});

test('a custom run survives the round trip through the link', async ({ page }) => {
  await open(page);
  await page.selectOption('#stream', 'custom');
  await page.fill('#custom-text', '# Mine\n\n**bold** text');
  await page.click('#custom-go');
  await page.click('#finish');
  const url = page.url();
  await page.goto('about:blank');
  await open(page, url.slice(url.indexOf('#')));
  await page.click('#finish');
  await expect(page.locator('#out h1')).toHaveText('Mine');
  await expect(page.locator('#out strong')).toHaveText('bold');
});

for (const [name, hash] of [
  ['unknown stream', '#stream=nope'],
  ['prototype key', '#stream=__proto__'],
  ['constructor key', '#stream=constructor'],
  ['malformed base64', '#stream=custom&m=!!!'],
  ['invalid utf-8', '#stream=custom&m=_w'],
  ['oversized markdown', `#stream=custom&m=${'A'.repeat(9000)}`],
  ['huge fragment', `#${'x'.repeat(20000)}`],
  ['not a number', '#c=NaN&s=-1&t=abc&d=99999'],
  ['script payload', '#stream=<script>alert(1)</script>'],
] as const) {
  test(`a bad link (${name}) falls back safely with no error`, async ({ page, seen }) => {
    await open(page, hash);
    expect(seen.errors).toEqual([]);
    await page.click('#finish');
    await expect(page.locator('#out')).not.toBeEmpty();
    expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  });
}

test('pasted hostile text is only text, and the proof still holds', async ({ page, seen }) => {
  await open(page);
  await page.selectOption('#stream', 'custom');
  await page.fill('#custom-text', '<img src=x onerror=alert(1)> [x](javascript:alert(1)) <script>alert(1)</script>');
  await page.click('#custom-go');
  await page.click('#finish');
  expect(await page.locator('#out img, #out script, #out a').count()).toBe(0);
  expect(await page.locator('#out').textContent()).toContain('<img src=x onerror=alert(1)>');
  expect(seen.errors).toEqual([]);
});

test('text over the limit is cut with a notice instead of freezing the page', async ({ page }) => {
  await open(page);
  await page.selectOption('#stream', 'custom');
  await page.locator('#custom-text').evaluate((t: HTMLTextAreaElement) => {
    t.value = 'a'.repeat(250_000);
  });
  await page.click('#custom-go');
  await expect(page.locator('#notice')).toContainText('200,000');
  await page.click('#finish');
  expect((await page.locator('#out').textContent())!.length).toBe(200_000);
});

test('the footer shows the version being run, and it equals package.json', async ({ page }) => {
  await open(page);
  await expect(page.locator('#release')).toContainText(`limmat ${VERSION}`);
  const rel = await page.evaluate(() => fetch('release.json').then((r) => r.json()));
  const live = await page.evaluate(() =>
    fetch('limmat.min.js')
      .then((r) => r.arrayBuffer())
      .then((b) => b.byteLength),
  );
  expect(rel.bytes).toBe(live);
});

test('the support table shows every row, including the gaps, and filters', async ({ page }) => {
  await open(page);
  const rows = page.locator('#support-table tbody tr');
  await expect.poll(() => rows.count()).toBeGreaterThan(20);
  await page.click('[data-filter="not-yet"]');
  const visible = await rows.evaluateAll((trs) =>
    trs.filter((t) => !(t as HTMLElement).hidden).map((t) => (t as HTMLElement).dataset.status),
  );
  expect(visible.length).toBeGreaterThan(3);
  expect(new Set(visible)).toEqual(new Set(['not-yet']));
});

test('the controls work from the keyboard alone', async ({ page, browserName }) => {
  await open(page);
  await page.focus('#play');
  const label = await page.locator('#play').textContent();
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).not.toHaveText(label!);
  // Safari (and the WebKit build) does not Tab onto buttons by default, so only check the Tab order elsewhere.
  if (browserName !== 'webkit') {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('step');
  } else await page.focus('#step');
  await page.keyboard.press('Enter');
  expect(await page.locator('#raw').textContent()).not.toBe('');
});

test('with reduced motion nothing autoplays and the finished state is shown', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('#play')).toHaveText('Replay');
  await expect(page.locator('#out h2')).toBeVisible();
  const before = await page.locator('#out').innerHTML();
  await page.waitForTimeout(300);
  expect(await page.locator('#out').innerHTML()).toBe(before);
});

test('the metrics are measured from real writes and labeled as not a benchmark', async ({ page }) => {
  await open(page);
  await page.click('#finish');
  const text = await page.locator('#metrics').textContent();
  expect(text).toContain('not a benchmark');
  const bytes = Number(/(\d+) bytes streamed/.exec(text!)![1]);
  const raw = await page.locator('#raw').textContent();
  expect(bytes).toBe(new TextEncoder().encode(raw!).length);
  // The count follows late changes (the highlighter adds spans after the fence closes), so wait for it to settle.
  await expect
    .poll(async () => {
      const t = await page.locator('#metrics').textContent();
      return Number(/(\d+) DOM nodes/.exec(t!)![1]) - (await page.locator('#out *').count());
    })
    .toBe(0);
});

for (const [name, setup] of [
  ['light', async (p: import('@playwright/test').Page) => p.emulateMedia({ colorScheme: 'light' })],
  ['dark', async (p: import('@playwright/test').Page) => p.emulateMedia({ colorScheme: 'dark' })],
  ['forced colors', async (p: import('@playwright/test').Page) => p.emulateMedia({ forcedColors: 'active' })],
] as const) {
  test(`axe finds no accessibility violations (${name})`, async ({ page }) => {
    await setup(page);
    await open(page);
    await page.click('#finish');
    await page.click('#run-check');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  });
}

test('the page and every gallery card stay a sane height, even with 13 nested quotes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, '#v=1&stream=reply&c=6&r=1&s=1&t=0&d=400');
  await page.click('#finish');
  const heights = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight,
    cards: Array.from(document.querySelectorAll<HTMLElement>('#cards .card'), (c) => c.offsetHeight),
  }));
  expect(Math.max(...heights.cards)).toBeLessThan(800);
  expect(heights.page).toBeLessThan(6000);
});
