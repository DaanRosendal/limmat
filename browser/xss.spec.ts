import { XSS } from '../test/helpers/cases';
import { audit } from './audit';
import { expect, test } from './fixture';

test.describe('xss in a real browser: nothing executes, nothing loads, nothing dangerous is in the DOM', () => {
  for (const [name, md] of XSS) {
    for (const mode of ['whole', 'char'] as const) {
      test(`${name} (${mode})`, async ({ page }) => {
        const external: string[] = [];
        page.on('request', (r) => {
          if (!r.url().startsWith('https://limmat.test/') && !r.url().startsWith('data:')) external.push(r.url());
        });
        const url = page.url();
        const result = await page.evaluate(
          async ({ md, mode, auditSrc }) => {
            (window as any).__pwned = false;
            window.alert = () => {
              (window as any).__pwned = true;
            };
            const root = document.getElementById('root')!;
            root.replaceChildren();
            const r = (window as any).limmat.createRenderer(root, { throttleMs: 0, onLinkClick: () => true });
            if (mode === 'whole') r.write(md);
            else for (const ch of md) r.write(ch);
            r.end();
            root.querySelectorAll('a').forEach((a) => a.click());
            // Anything a payload could run does so at insertion or on a click, which has happened by now. One frame and one
            // timer turn let late microtask and timer handlers fire, and any image that was created settles its load or error.
            await Promise.all(
              Array.from(root.querySelectorAll('img'), (img) =>
                img.complete ? 0 : new Promise((res) => (img.onload = img.onerror = res)),
              ),
            );
            await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
            return { pwned: (window as any).__pwned, problems: new Function('return ' + auditSrc)()(root) as string[] };
          },
          { md, mode, auditSrc: audit.toString() },
        );
        expect(result.pwned).toBe(false);
        expect(result.problems).toEqual([]);
        expect(external).toEqual([]);
        expect(page.url()).toBe(url);
      });
    }
  }
});
