import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, open, test } from './demo-fixture';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const STREAMS = ['reply', 'mid-marker', 'table', 'fence', 'link-split', 'list'];

const pick = (page: Page, group: string, value: string) => page.locator(`input[name="${group}"][value="${value}"]`).click();
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
const openTab = async (page: Page, name: string) => {
  await page.click(`.tab[data-panel="${name}"]`);
  await expect(page.locator(`#panel-${name}`)).toHaveClass(/open/);
  await settle(page);
};

test('loads with no errors, no CSP violations, and only same-origin requests', async ({ page, seen }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('never half-finished');
  expect(seen.errors).toEqual([]);
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  expect(seen.requests.filter((u) => !u.startsWith('https://limmat.test/'))).toEqual([]);
  expect(seen.requests.length).toBeLessThan(40);
});

test('the page has no inline script, no inline style attribute, and sets no cookie or storage', async ({ page }) => {
  await open(page);
  await openTab(page, 'attack');
  await page.click('input[name="view"][value="dom"]');
  const found = await page.evaluate(() => ({
    inlineScripts: Array.from(document.scripts).filter((s) => !s.src).length,
    styleAttrs: document.querySelectorAll('[style]').length,
    cookie: document.cookie,
    storage: localStorage.length + sessionStorage.length,
  }));
  expect(found).toEqual({ inlineScripts: 0, styleAttrs: 0, cookie: '', storage: 0 });
});

test('every stream ends with the same HTML for every chunking (the check panel)', async ({ page }) => {
  await open(page);
  await openTab(page, 'check');
  for (const name of STREAMS) {
    await pick(page, 'stream', name);
    await page.click('#finish');
    await page.click('#run-check');
    await expect(page.locator('#check-verdict')).toHaveClass(/ok/);
    await expect(page.locator('#check-verdict')).toContainText('identical');
  }
  // Streams with scripted cuts also compare those exact cuts.
  await expect(page.locator('#check-table tbody tr').last()).toContainText('scripted cuts');
});

test('the open block readout names the construct that is still open', async ({ page }) => {
  await open(page);
  await pick(page, 'stream', 'table');
  // The scrubber pauses and rebuilds in one step, so this does not race the autoplay timer.
  await page.fill('#pos', '2');
  await expect(page.locator('#open-readout')).toContainText('table');
  await expect(page.locator('#out .is-open')).toHaveCount(1);
  await page.click('#finish');
  await expect(page.locator('#open-readout')).toContainText('Done');
  await expect(page.locator('#out .is-open')).toHaveCount(0);
});

test('the scrubber rebuilds the output at a position and stays paused', async ({ page }) => {
  await open(page);
  await pick(page, 'stream', 'fence');
  await page.fill('#pos', '2');
  await expect(page.locator('#pos-out')).toHaveText('2 / 4');
  await expect(page.locator('#play')).toHaveText('Play');
  expect(await page.locator('#raw').textContent()).toBe('``' + '`ts\nlet a = 1;\n');
  await expect(page.locator('#out .limmat-code')).toHaveCount(1);
  await expect(page.locator('#out code')).toContainText('let a = 1;');
});

test('chunk size changes the stream, and Random again reshuffles the cuts', async ({ page }) => {
  await open(page);
  await pick(page, 'size', '1');
  await page.click('#finish');
  const chars = Array.from((await page.locator('#raw').textContent())!).length;
  await expect(page.locator('#v-chunks')).toHaveText(String(chars));
  await pick(page, 'size', 'random');
  const seed = () => new URL(page.url().replace('#', '?')).searchParams.get('s');
  const first = await seed();
  await pick(page, 'size', 'random');
  expect(await seed()).not.toBe(first);
});

test('the hostile gallery runs nothing, loads nothing, and the verdicts match reality', async ({ page, seen }) => {
  await open(page);
  await openTab(page, 'attack');
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
    Scripts: 0,
    Images: 0,
    Handlers: 0,
    'Bad links': 0,
    Links: 1,
    'Image requests': 0,
    'alert() calls': 0,
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
  // The DOM view shows the same output as text.
  await page.click('input[name="view"][value="dom"]');
  await expect(cards.nth(6).locator('.dom')).toContainText('<script>alert(1)</script>');
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.requests.filter((u) => !u.startsWith('https://limmat.test/'))).toEqual([]);
});

test('a shared link restores the settings and plays the same chunks', async ({ page }) => {
  await open(page, '#v=1&stream=table&c=3&r=0&s=7&t=0&d=10');
  await expect(page.locator('input[name="stream"][value="table"]')).toBeChecked();
  await expect(page.locator('input[name="throttle"][value="0"]')).toBeChecked();
  await page.click('#finish');
  await expect(page.locator('#out table')).toHaveCount(1);
  await pick(page, 'stream', 'reply');
  expect(page.url()).toContain('stream=reply');
  await pick(page, 'size', 'random');
  expect(page.url()).toContain('r=1');
  expect(page.url()).toContain('s=7');
});

test('a custom run survives the round trip through the link', async ({ page }) => {
  await open(page);
  await pick(page, 'stream', 'custom');
  await expect(page.locator('#panel-paste')).toHaveClass(/open/);
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
  await pick(page, 'stream', 'custom');
  await page.fill('#custom-text', '<img src=x onerror=alert(1)> [x](javascript:alert(1)) <script>alert(1)</script>');
  await page.click('#custom-go');
  await page.click('#finish');
  expect(await page.locator('#out img, #out script, #out a').count()).toBe(0);
  expect(await page.locator('#out').textContent()).toContain('<img src=x onerror=alert(1)>');
  await expect(page.locator('#chip-scripts b')).toHaveText('0');
  await expect(page.locator('#chip-images b')).toHaveText('0');
  expect(seen.errors).toEqual([]);
});

test('text over the limit is cut with a notice instead of freezing the page', async ({ page }) => {
  await open(page);
  await pick(page, 'stream', 'custom');
  await page.locator('#custom-text').evaluate((t: HTMLTextAreaElement) => {
    t.value = 'a'.repeat(250_000);
  });
  await page.click('#custom-go');
  await expect(page.locator('#notice')).toContainText('200,000');
  await page.click('#finish');
  expect((await page.locator('#out').textContent())!.length).toBe(200_000);
});

test('the header shows the version being run, and it equals package.json', async ({ page }) => {
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

test('the support panel shows every row, including the gaps, and filters', async ({ page }) => {
  await open(page);
  await openTab(page, 'support');
  const rows = page.locator('#support-table tbody tr');
  await expect.poll(() => rows.count()).toBeGreaterThan(20);
  await page.click('[data-filter="not-yet"]');
  const visible = await rows.evaluateAll((trs) =>
    trs.filter((t) => !(t as HTMLElement).hidden).map((t) => (t as HTMLElement).dataset.status),
  );
  expect(visible.length).toBeGreaterThan(3);
  expect(new Set(visible)).toEqual(new Set(['not-yet']));
});

test('panels open over the output, close with Escape, and give focus back', async ({ page }) => {
  await open(page);
  const tab = page.locator('.tab[data-panel="check"]');
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel-check')).toHaveClass(/open/);
  await expect(tab).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#out')).toHaveJSProperty('inert', false); // the element is not inert, its pane is
  expect(
    await page
      .locator('.pane')
      .first()
      .evaluate((e) => (e as HTMLElement).inert),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-check')).not.toHaveClass(/open/);
  await expect(tab).toHaveAttribute('aria-expanded', 'false');
  await expect(tab).toBeFocused();
  expect(
    await page
      .locator('.pane')
      .first()
      .evaluate((e) => (e as HTMLElement).inert),
  ).toBe(false);
});

test('the menu offers paste and share, and the theme toggle switches the theme', async ({ page }) => {
  await open(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#menu-btn');
  await expect(page.locator('#menu')).toHaveClass(/open/);
  await page.click('#paste-open');
  await expect(page.locator('#panel-paste')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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

test('the chips are measured from real writes and the timing is labeled as not a benchmark', async ({ page }) => {
  await open(page);
  await page.click('#finish');
  await expect(page.locator('#chip-ms')).toHaveAttribute('title', /not a benchmark/);
  const bytes = Number(await page.locator('#v-bytes').textContent());
  const raw = await page.locator('#raw').textContent();
  expect(bytes).toBe(new TextEncoder().encode(raw!).length);
  // The count follows late changes (the highlighter adds spans after the fence closes), so wait for it to settle.
  await expect.poll(async () => Number(await page.locator('#chip-nodes b').textContent()) - (await page.locator('#out *').count())).toBe(0);
});

for (const [name, setup] of [
  ['light', async (p: Page) => p.emulateMedia({ colorScheme: 'light' })],
  ['dark', async (p: Page) => p.emulateMedia({ colorScheme: 'dark' })],
  ['forced colors', async (p: Page) => p.emulateMedia({ forcedColors: 'active' })],
] as const) {
  test(`axe finds no accessibility violations on the page and every panel (${name})`, async ({ page }) => {
    await setup(page);
    await open(page);
    await page.click('#finish');
    const scan = async (label: string) => {
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
    };
    await scan('page');
    for (const panel of ['check', 'attack', 'support']) {
      await openTab(page, panel);
      await scan(panel);
      await page.keyboard.press('Escape');
      await settle(page);
    }
    await page.click('#menu-btn');
    await page.click('#paste-open');
    await settle(page);
    await scan('paste');
  });
}

for (const [w, h] of [
  [1280, 720],
  [1100, 700],
  [1024, 640],
] as const) {
  test(`the whole page fits one screen at ${w}x${h}, with and without a panel`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, '#v=1&stream=reply&c=6&r=1&s=1&t=0&d=400');
    await page.click('#finish');
    const fits = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollHeight - innerHeight,
        sideways: document.documentElement.scrollWidth - innerWidth,
      }));
    expect(await fits()).toEqual({ page: 0, sideways: 0 });
    await openTab(page, 'attack');
    expect(await fits()).toEqual({ page: 0, sideways: 0 });
    // Every hostile card fits inside the panel without scrolling it, even with 5,000 nested quotes.
    const spill = await page.evaluate(() => {
      const body = document.querySelector('#panel-attack .panel-body')!;
      return body.scrollHeight - body.clientHeight;
    });
    if (w >= 1280) expect(spill).toBeLessThanOrEqual(1);
  });
}

test('a phone-width screen has no sideways scroll and keeps every control reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const sel of ['#play', '.tab[data-panel="attack"]', '#menu-btn', 'input[name="stream"][value="custom"]']) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    await expect(page.locator(sel)).toBeVisible();
  }
  await openTab(page, 'attack');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('choosing another stream puts the paste editor away', async ({ page }) => {
  await open(page);
  await pick(page, 'stream', 'custom');
  await expect(page.locator('#panel-paste')).toHaveClass(/open/);
  await pick(page, 'stream', 'table');
  await expect(page.locator('#panel-paste')).not.toHaveClass(/open/);
  await expect(page.locator('input[name="stream"][value="table"]')).toBeChecked();
  await expect(page.locator('.pane').first()).not.toHaveJSProperty('inert', true);
});
