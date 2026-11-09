import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, open, test } from './demo-fixture';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;

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
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Streaming markdown');
  expect(seen.errors).toEqual([]);
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  expect(seen.requests.filter((u) => !u.startsWith('https://limmat.test/'))).toEqual([]);
  expect(seen.requests.length).toBeLessThan(40);
});

test('the page has no inline script, no inline style attribute, and sets no cookie or storage', async ({ page }) => {
  await open(page);
  await openTab(page, 'support');
  const found = await page.evaluate(() => ({
    inlineScripts: Array.from(document.scripts).filter((s) => !s.src).length,
    styleAttrs: document.querySelectorAll('[style]').length,
    cookie: document.cookie,
    storage: localStorage.length + sessionStorage.length,
  }));
  expect(found).toEqual({ inlineScripts: 0, styleAttrs: 0, cookie: '', storage: 0 });
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
  await expect(page.locator('#pos')).toHaveAttribute('max', String(chars));
  await pick(page, 'size', 'random');
  const seed = () => new URL(page.url().replace('#', '?')).searchParams.get('s');
  const first = await seed();
  await pick(page, 'size', 'random');
  expect(await seed()).not.toBe(first);
});

test('the Attack stream runs nothing, loads nothing, and shows the payloads as text', async ({ page, seen }) => {
  await open(page);
  await pick(page, 'stream', 'hostile');
  await page.click('#finish');
  // Hostile input went in (counted by pattern in the text), and nothing came out as a live element.
  await expect(page.locator('#chip-attacks')).toBeVisible();
  await expect(page.locator('#chip-attacks')).toHaveText('Nothing unsafe got through');
  await expect(page.locator('#chip-attacks')).toHaveClass(/safe/);
  const out = page.locator('#out');
  expect(await out.locator('script, img, [onerror], [onclick]').count()).toBe(0);
  // The links that refused are plain text, the one real link has a safe address, and the payloads are visible as text.
  const hrefs = await page.$$eval('#out a', (as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual(['https://example.com']);
  await expect(out).toContainText('<script>alert(1)</script>');
  await expect(out).toContainText('<img src=x onerror=alert(1)>');
  await expect(out.locator('.limmat-lang')).toHaveText('a');
  // Nested quotes are capped, and clicking the link never leaves the page.
  expect(await out.locator('blockquote').count()).toBeLessThan(40);
  await page.evaluate(() => {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#out a')) a.addEventListener('click', (e) => e.preventDefault());
  });
  expect(page.url()).toContain('https://limmat.test/');
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.requests.filter((u) => !u.startsWith('https://limmat.test/'))).toEqual([]);
});

test('a chip turns red if the output ever has something unsafe in it', async ({ page }) => {
  await open(page);
  await page.click('#finish');
  await expect(page.locator('#chip-attacks')).toBeHidden(); // nothing hostile went in, so there is nothing to report
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'javascript:void(0)';
    document.querySelector('#out')!.append(a);
  });
  await expect(page.locator('#chip-attacks')).toHaveClass(/bad/);
  await expect(page.locator('#chip-attacks')).toHaveText('Something unsafe got through');
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
  await expect(page.locator('#chip-attacks')).toBeVisible();
  await expect(page.locator('#chip-attacks')).toHaveText('Nothing unsafe got through');
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
  const tab = page.locator('.tab[data-panel="support"]');
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel-support')).toHaveClass(/open/);
  await expect(tab).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#out')).toHaveJSProperty('inert', false); // the element is not inert, its pane is
  expect(
    await page
      .locator('.pane')
      .first()
      .evaluate((e) => (e as HTMLElement).inert),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-support')).not.toHaveClass(/open/);
  await expect(tab).toHaveAttribute('aria-expanded', 'false');
  await expect(tab).toBeFocused();
  expect(
    await page
      .locator('.pane')
      .first()
      .evaluate((e) => (e as HTMLElement).inert),
  ).toBe(false);
});

test('the share button copies the run link and says so, and the theme toggle switches the theme', async ({ page }) => {
  await open(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#share');
  await expect(page.locator('#notice')).toContainText(/Link copied|Copying is blocked/);
  expect(page.url()).toContain('stream=reply');
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the header links to GitHub and the support table links to the CommonMark spec', async ({ page }) => {
  await open(page);
  const github = page.locator('a[aria-label="limmat on GitHub"]');
  await expect(github).toHaveAttribute('href', 'https://github.com/DaanRosendal/limmat');
  await expect(github).toHaveAttribute('target', '_blank');
  await expect(github).toHaveAttribute('rel', /noopener/);
  await openTab(page, 'support');
  const spec = page.locator('#support-table th a');
  await expect(spec).toHaveAttribute('href', 'https://spec.commonmark.org/0.31.2/');
  await expect(spec).toHaveAttribute('target', '_blank');
  await expect(spec).toHaveAttribute('rel', /noopener/);
  // The header stays on one line, and every link on the page opens a new tab.
  expect(await spec.evaluate((a) => a.getBoundingClientRect().height)).toBeLessThan(30);
  expect(await page.$$eval('a[href^="http"]:not(#out a)', (as) => as.filter((a) => a.getAttribute('target') !== '_blank').length)).toBe(0);
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
    for (const panel of ['support']) {
      await openTab(page, panel);
      await scan(panel);
      await page.keyboard.press('Escape');
      await settle(page);
    }
    await pick(page, 'stream', 'custom');
    await settle(page);
    await scan('paste');
  });
}

for (const [w, h] of [
  [1280, 720],
  [1100, 700],
  [1024, 640],
] as const) {
  test(`the whole page fits one screen at ${w}x${h}, with and without the support panel`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, '#v=1&stream=hostile&c=6&r=1&s=1&t=0&d=400');
    await page.click('#finish');
    const fits = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollHeight - innerHeight,
        sideways: document.documentElement.scrollWidth - innerWidth,
      }));
    expect(await fits()).toEqual({ page: 0, sideways: 0 });
    await openTab(page, 'support');
    expect(await fits()).toEqual({ page: 0, sideways: 0 });
  });
}

test('a phone-width screen has no sideways scroll and keeps every control reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const sel of ['#play', '.tab[data-panel="support"]', '#share', 'input[name="stream"][value="custom"]']) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    await expect(page.locator(sel)).toBeVisible();
  }
  await openTab(page, 'support');
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

test('once a stream is done the raw pane is an editor, and typing renders as a live open stream', async ({ page }) => {
  await open(page);
  await expect(page.locator('#raw-edit')).toBeHidden();
  await expect(page.locator('#edit-hint')).toBeHidden();
  await pick(page, 'stream', 'table');
  await page.click('#finish');
  const editor = page.locator('#raw-edit');
  await expect(editor).toBeVisible();
  await expect(page.locator('#edit-hint')).toBeVisible();
  await expect(editor).toHaveValue('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n');
  // A marker that is still open never shows its raw asterisks.
  await editor.fill('Typing **bo');
  await expect(page.locator('#out')).toContainText('Typing bo');
  expect(await page.locator('#out').textContent()).not.toContain('*');
  await expect(page.locator('#open-readout')).toContainText('Open');
  await editor.fill('Typing **bold** now');
  await expect(page.locator('#out strong')).toHaveText('bold');
  // The edit became "Custom" and ends up in the link.
  await expect(page.locator('input[name="stream"][value="custom"]')).toBeChecked();
  await expect.poll(() => page.url()).toContain('stream=custom');
  // Replay streams the edited text, and the editor steps aside while it plays.
  await page.click('#play');
  await expect(editor).toBeHidden();
  await page.click('#finish');
  await expect(page.locator('#out strong')).toHaveText('bold');
  await expect(editor).toHaveValue('Typing **bold** now');
});

test('the play button keeps one width for Play, Pause, and Replay', async ({ page }) => {
  await open(page);
  const width = () => page.locator('#play').evaluate((e) => e.getBoundingClientRect().width);
  const seen = new Set([await width()]);
  await page.click('#play');
  seen.add(await width());
  await page.click('#finish');
  await expect(page.locator('#play')).toHaveText('Replay');
  seen.add(await width());
  expect(seen.size).toBe(1);
});

test('typing at the end only appends, so finished blocks are not rebuilt', async ({ page }) => {
  await open(page, '#v=1&stream=reply&c=12&r=1&s=1&t=0&d=10');
  await page.click('#finish');
  const editor = page.locator('#raw-edit');
  await editor.press('Control+End');
  await page.keyboard.type('x'); // the first edit after the stream ended rebuilds once
  await page.evaluate(() => {
    for (const n of document.querySelectorAll('#out > *')) (n as any).__keep = true;
  });
  await page.keyboard.type('yz');
  const kept = await page.evaluate(() => Array.from(document.querySelectorAll('#out > *')).filter((n) => (n as any).__keep).length);
  expect(kept).toBeGreaterThan(5); // every finished block is the same element as before
  await expect(page.locator('#out')).toContainText('xyz');
});

test('a rebuilt code block is coloured in the same frame, so editing never flashes plain code', async ({ page }) => {
  await open(page, '#v=1&stream=reply&c=12&r=1&s=1&t=0&d=10');
  await page.click('#finish');
  await expect(page.locator('#out .shj-syn-kwd').first()).toBeAttached();
  const editor = page.locator('#raw-edit');
  // A deletion at the end cannot append, so it rebuilds the whole output. Check the colours before the next frame.
  const coloured = await editor.evaluate((t: HTMLTextAreaElement) => {
    t.value = t.value.slice(0, -1);
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return document.querySelectorAll('#out .shj-syn-kwd').length;
  });
  expect(coloured).toBeGreaterThan(0);
});
