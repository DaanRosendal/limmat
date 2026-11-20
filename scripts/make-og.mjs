// Renders the social preview card (1200x630) to demo/assets/og.png. Run `node scripts/make-og.mjs` after changing the wording.
// Link previews (Slack, X, LinkedIn) need a PNG, and the GitHub social preview takes the same file (Settings > General).
import { chromium } from '@playwright/test';

const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:1200px;height:630px;background:#09090c;color:#f3f3f7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;padding:0 110px;box-sizing:border-box;gap:70px}
  h1{margin:0;font-size:132px;letter-spacing:-4px;font-weight:700}
  p{margin:22px 0 0;font-size:40px;line-height:1.3;color:#a2a2b0;white-space:nowrap}
</style>
<svg width="260" height="260" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#171717"/><rect x="9" y="6" width="3.5" height="20" rx="1" fill="#4cc3ee"/><rect x="16" y="22.5" width="8" height="3.5" rx="1" fill="#fff"/></svg>
<div><h1>limmat</h1><p>Streaming markdown for LLM chat.</p></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: 'demo/assets/og.png' });
await browser.close();
console.log('wrote demo/assets/og.png');
