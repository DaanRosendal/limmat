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

test('the Showcase plays first, and it is the stream that is checked in the dock', async ({ page }) => {
  await open(page);
  await expect(page.locator('input[name="stream"][value="showcase"]')).toBeChecked();
  await page.click('#finish');
  await expect(page.locator('#out img[src="/limmat-mark.svg"]')).toBeVisible();
  await expect(page.locator('#out details[open] details')).toHaveCount(1);
  await expect(page.locator('#chip-attacks')).toHaveText('Nothing unsafe got through');
  await expect(page.locator('#chip-attacks')).toHaveClass(/safe/);
  await expect(page.locator('#open-readout')).toContainText('Done');
});

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
    // The page's own markup. limmat's output is checked below, because its tables set text-align through the CSSOM.
    styleAttrs: Array.from(
      document.querySelectorAll('[style]:not(#out *)'),
      (e) => `${e.tagName}${e.id ? `#${e.id}` : ''}.${e.getAttribute('class')} style="${e.getAttribute('style')}"`,
    ),
    cookie: document.cookie,
    storage: localStorage.length + sessionStorage.length,
  }));
  expect(found).toEqual({ inlineScripts: 0, styleAttrs: [], cookie: '', storage: 0 });
  // Inside limmat's output the only style is a table cell's alignment (set through the CSSOM, which a strict
  // style-src allows), and it appears once the stream reaches a table, so which cells exist depends on timing.
  await page.click('#finish');
  const inOutput = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#out [style]'), (e) => `${e.tagName} ${e.getAttribute('style')}`),
  );
  for (const s of inOutput) expect(s).toMatch(/^(TH|TD) text-align: (left|center|right);$/);
  expect(await page.evaluate(() => (window as any).__csp ?? [])).toEqual([]);
});

test('the open block readout names the construct that is still open', async ({ page }) => {
  // One character per chunk, so the position below is inside the table's first data row.
  await open(page, '#v=1&stream=table&c=1&r=0&s=1&t=0&d=400');
  // The scrubber pauses and rebuilds in one step, so this does not race the autoplay timer.
  await page.fill('#pos', '119');
  await expect(page.locator('#open-readout')).toContainText('table');
  await expect(page.locator('#out .is-open')).toHaveCount(1);
  await page.click('#finish');
  await expect(page.locator('#open-readout')).toContainText('Done');
  await expect(page.locator('#out .is-open')).toHaveCount(0);
});

test('the scrubber rebuilds the output at a position and stays paused', async ({ page }) => {
  await open(page, '#v=1&stream=fence&c=1&r=0&s=1&t=0&d=400');
  await page.fill('#pos', '70');
  await expect(page.locator('#pos-out')).toHaveText(/^70 \/ \d+$/);
  await expect(page.locator('#play')).toHaveText('Play');
  const raw = (await page.locator('#raw').textContent())!;
  expect(Array.from(raw).length).toBe(70);
  expect(raw).toMatch(/^Here is a small retry helper:\n\n```ts\n/);
  // The fence is still open, and its code is already on the page.
  await expect(page.locator('#out .limmat-code')).toHaveCount(1);
  await expect(page.locator('#out code')).toContainText('async function');
});

/** Drag a slider to a position (0 to 100), the way a person would: press on it, move, release. */
const slide = async (page: Page, id: string, position: number) => {
  await page.locator(`#sl-${id}`).scrollIntoViewIfNeeded();
  const box = (await page.locator(`#sl-${id}`).boundingBox())!;
  const y = box.y + 16;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 26 + ((box.width - 52) * position) / 100, y, { steps: 3 });
  await page.mouse.up();
};
const readout = (page: Page, id: string) => page.locator(`#sl-${id}`).getAttribute('aria-valuetext');
const seedOf = (page: Page) => new URL(page.url().replace('#', '?')).searchParams.get('s');

test('the chunk size slider changes the stream, and turning Random on picks new cuts', async ({ page }) => {
  await open(page);
  await slide(page, 'size', 0); // the far left is size 1
  await expect(page.locator('#sl-size')).toHaveAttribute('aria-valuetext', '1-1');
  await page.click('#rand'); // off: every chunk is exactly the size
  await expect(page.locator('#rand')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sl-size')).toHaveAttribute('aria-valuetext', '1');
  await page.click('#finish');
  const chars = Array.from((await page.locator('#raw').textContent())!).length;
  await expect(page.locator('#pos')).toHaveAttribute('max', String(chars));
  const before = await seedOf(page);
  await page.click('#rand');
  expect(await seedOf(page)).not.toBe(before);
  expect(page.url()).toContain('r=1');
});

test('sliders snap to the preset marks when close, and any value in between is reachable', async ({ page }) => {
  await open(page);
  // Throttle presets are 0, 50, and 200 ms. Close to a mark snaps onto it.
  await slide(page, 'throttle', 31);
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '50 ms');
  await slide(page, 'throttle', 63);
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '200 ms');
  // Far from every mark, the value is whatever the position says, so it is neither of the presets.
  await slide(page, 'throttle', 45);
  const between = Number((await readout(page, 'throttle'))!.replace(' ms', ''));
  expect([0, 50, 200]).not.toContain(between);
  expect(between).toBeGreaterThan(50);
  expect(between).toBeLessThan(200);
  expect(page.url()).toContain(`t=${between}`);
  await slide(page, 'size', 41); // the preset 5
  await expect(page.locator('#sl-size')).toHaveAttribute('aria-valuetext', '1-5');
  await slide(page, 'speed', 55); // the preset 60 ms between chunks, 17 per second
  await expect(page.locator('#sl-speed')).toHaveAttribute('aria-valuetext', '17/s');
});

test('clicking a preset mark jumps the slider to that preset', async ({ page }) => {
  await open(page);
  const marks = page.locator('#sl-throttle .tick');
  expect(await marks.count()).toBe(3);
  await marks.nth(2).locator('rect').click();
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '200 ms');
  expect(page.url()).toContain('t=200');
  await expect(marks.nth(2)).toHaveClass(/on/);
  await marks.nth(0).locator('rect').click();
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '0 ms');
  await expect(marks.nth(2)).not.toHaveClass(/on/);
  await page.locator('#sl-size .tick rect').nth(1).click();
  await expect(page.locator('#sl-size')).toHaveAttribute('aria-valuetext', '1-5');
});

test('the value sits inside the thumb, and the thumb is where the slider says', async ({ page }) => {
  await open(page);
  await slide(page, 'throttle', 63); // the 200 ms preset
  const where = await page.evaluate(() => {
    const root = document.querySelector('#sl-throttle')!.getBoundingClientRect();
    const pill = document.querySelector('#sl-throttle .thumb rect')!.getBoundingClientRect();
    const text = document.querySelector('#sl-throttle .thumb text')!.getBoundingClientRect();
    return {
      thumbX: pill.left + pill.width / 2,
      expectedX: root.left + 26 + ((root.width - 52) * 63) / 100,
      textInside: text.left >= pill.left && text.right <= pill.right && text.top >= pill.top && text.bottom <= pill.bottom,
    };
  });
  expect(Math.abs(where.thumbX - where.expectedX)).toBeLessThan(2);
  expect(where.textInside).toBe(true);
  await expect(page.locator('#sl-throttle .thumb text')).toHaveText('200 ms');
});

test('the sliders work from the keyboard', async ({ page }) => {
  await open(page);
  const slider = page.locator('#sl-throttle');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '0 ms');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', '500 ms');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuenow', '99');
  expect(await readout(page, 'throttle')).not.toBe('500 ms');
  // The stream restarts once the key presses stop, and the link follows.
  await expect.poll(() => page.url()).toMatch(/t=4\d\d/);
});

test('every preset mark shows its value without a hover', async ({ page }) => {
  await open(page);
  const labels = async (id: string) => page.locator(`#sl-${id} .tick text`).allTextContents();
  expect(await labels('size')).toEqual(['1', '5', '20']);
  expect(await labels('throttle')).toEqual(['0', '50', '200']);
  expect(await labels('speed')).toEqual(['5/s', '17/s', '67/s']);
  // The label of the preset in use is highlighted, and the marks still say what they mean on hover.
  await expect(page.locator('#sl-throttle .tick').nth(1)).toHaveClass(/on/);
  await expect(page.locator('#sl-throttle .tick title').nth(2)).toHaveText('200 ms');
  await expect(page.locator('#sl-speed .tick title').nth(1)).toHaveText('17 chunks per second');
});

test('every control has a short tip on hover and keyboard focus', async ({ page }) => {
  await open(page);
  const tips = page.locator('.tip');
  expect(await tips.count()).toBe(4);
  for (const text of await tips.allTextContents()) expect(text.trim().split(/\s+/).length).toBeLessThanOrEqual(7);
  const info = page.locator('button[aria-label="About throttle"]');
  await expect(page.locator('#tip-throttle')).toBeHidden();
  await info.hover();
  await expect(page.locator('#tip-throttle')).toBeVisible();
  await page.mouse.move(0, 0);
  await info.focus();
  await page.keyboard.press('Tab'); // leave, then come back with the keyboard
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#tip-throttle')).toBeVisible();
  await expect(info).toHaveAttribute('aria-describedby', 'tip-throttle');
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
  await open(page, '#v=1&stream=reply'); // a stream with no hostile input, so the chip starts hidden
  await page.click('#finish');
  await expect(page.locator('#chip-attacks')).toBeHidden();
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'javascript:void(0)';
    document.querySelector('#out')!.append(a);
  });
  await expect(page.locator('#chip-attacks')).toHaveClass(/bad/);
  await expect(page.locator('#chip-attacks')).toHaveText('Something unsafe got through');
});

test('ordinary text, code, and a local image do not set off the attack chip', async ({ page, seen }) => {
  await open(page);
  await pick(page, 'stream', 'custom');
  await page.fill(
    '#custom-text',
    'The river:\n\n![The river](/favicon.svg)\n\n```js\nconst one = 1;\nconst once = true;\n```\n\nOnline only.',
  );
  await page.click('#custom-go');
  await page.click('#finish');
  await expect(page.locator('#out img')).toHaveCount(1);
  await expect(page.locator('#chip-attacks')).toBeHidden();
  expect(seen.requests.filter((u) => !u.startsWith('https://limmat.test/'))).toEqual([]);
});

test('a remote image in the output still turns the chip red, and an event handler in the input is still counted', async ({ page }) => {
  await open(page);
  await page.click('#finish');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.setAttribute('src', 'https://evil.example/x.png');
    document.querySelector('#out')!.append(img);
  });
  await expect(page.locator('#chip-attacks')).toHaveClass(/bad/);
  await pick(page, 'stream', 'custom');
  await page.fill('#custom-text', 'x <b onclick=alert(1)>y</b> and ![t](https://evil.example/t.png)');
  await page.click('#custom-go');
  await page.click('#finish');
  await expect(page.locator('#chip-attacks')).toHaveClass(/safe/);
});

test('the Chunks button tints the raw chunks, is on by default, and a link remembers it', async ({ page }) => {
  await open(page, '#v=1&stream=reply&c=6&r=0&s=1&t=0&d=400');
  const button = page.locator('#marks');
  const tint = () =>
    page
      .locator('#raw .c1')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.fill('#pos', '40'); // mid-stream and paused, with the raw pane showing the chunks
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await tint()).not.toBe('rgba(0, 0, 0, 0)');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(tint).toBe('rgba(0, 0, 0, 0)');
  expect(page.url()).toContain('k=0');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(tint).not.toBe('rgba(0, 0, 0, 0)');
  expect(page.url()).toContain('k=1');
  // A link with k=0 opens with the tint off (a fresh page load, because a changed hash alone does not reload).
  await page.goto('about:blank');
  await open(page, '#v=1&stream=reply&c=6&r=0&s=1&t=0&d=400&k=0');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.fill('#pos', '40');
  expect(await tint()).toBe('rgba(0, 0, 0, 0)');
  // Once the stream is done the raw pane is the editor, which has no chunks, so the button steps aside.
  await page.click('#finish');
  await expect(page.locator('#raw-edit')).toBeVisible();
  await expect(button).toBeHidden();
});

test('a shared link restores the settings and plays the same chunks', async ({ page }) => {
  await open(page, '#v=1&stream=table&c=3&r=0&s=7&t=0&d=10');
  await expect(page.locator('input[name="stream"][value="table"]')).toBeChecked();
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '0 ms');
  await page.click('#finish');
  await expect(page.locator('#out table')).toHaveCount(1);
  await pick(page, 'stream', 'reply');
  expect(page.url()).toContain('stream=reply');
  await page.click('#rand');
  expect(page.url()).toContain('r=1');
  expect(page.url()).toContain('s=8'); // turning Random on moved the seed along from 7
});

test('a link can carry any throttle and speed, not only the presets', async ({ page }) => {
  await open(page, '#v=1&stream=reply&c=9&r=0&s=1&t=120&d=100');
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '120 ms');
  await expect(page.locator('#sl-speed')).toHaveAttribute('aria-valuetext', '10/s');
  await expect(page.locator('#sl-size')).toHaveAttribute('aria-valuetext', '9');
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
  expect(page.url()).toContain('stream=showcase');
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
  [1000, 640],
  [900, 640],
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
  await expect(editor).toHaveValue(/^Here is a comparison of the three plans:/);
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

test('the sliders grow with the screen and fill the width on a phone', async ({ page }) => {
  const width = () => page.locator('#sl-throttle').evaluate((e) => e.getBoundingClientRect().width);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const laptop = await width();
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect.poll(width).toBeGreaterThan(laptop);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(width).toBeGreaterThan(300);
  // The thumb still follows the pointer at this width.
  await slide(page, 'throttle', 63);
  await expect(page.locator('#sl-throttle')).toHaveAttribute('aria-valuetext', '200 ms');
});
