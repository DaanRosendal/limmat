// The attack panel: twelve hostile inputs rendered by the real limmat, with live proof counters.
import { createRenderer } from '../limmat.min.js';
import { $, make } from './dom.js';
import { counters } from './state.js';

// [title, markdown, short verdict]
const HOSTILE = [
  ['javascript: link', '[x](javascript:alert(1))', 'Refused'],
  ['Tab in the scheme', '[x](java\tscript:alert(1))', 'Plain text'],
  ['Entity trick', '[x](java&#115;cript:alert(1))', 'Refused'],
  ['data: URL', '[x](data:text/html,<script>alert(1)</script>)', 'Refused'],
  ['Protocol-relative', '[x](//evil.com)', 'Refused'],
  ['Backslash trick', '[x](/\\evil.com)', 'Refused'],
  ['Script tag', '<script>alert(1)</script>', 'Shown as text'],
  ['Event handler', '<img src=x onerror=alert(1)>', 'Shown as text'],
  ['Tracking image', '![x](https://evil.com/track.png)', 'Alt text only'],
  ['Image in a link', '[![x](https://evil.com/p.png)](https://ok.com)', 'Link, no image'],
  ['5,000 nested quotes', `${'> '.repeat(5000)}deep`, 'Depth capped'],
  ['Class breakout', '```a b" onclick="alert(1)\ncode\n```', 'Class cleaned'],
];

/** The DOM as indented text, so the card can show what was built without trusting the picture. */
function dump(node, depth, lines, budget) {
  if (lines.length >= budget) return;
  const pad = '  '.repeat(Math.min(depth, 6));
  if (node.nodeType === 3) {
    const t = node.textContent.replace(/\s+/g, ' ').trim();
    if (t) lines.push(`${pad}"${t.length > 40 ? `${t.slice(0, 40)}...` : t}"`);
    return;
  }
  const attrs = Array.from(node.attributes, (a) => ` ${a.name}="${a.value}"`).join('');
  lines.push(`${pad}<${node.tagName.toLowerCase()}${attrs}>`);
  for (const k of node.childNodes) dump(k, depth + 1, lines, budget);
}

function buildCards() {
  const cards = $('#cards');
  const results = [];
  for (const [title, md, verdict] of HOSTILE) {
    const card = make('div', 'card');
    const shown = md.length > 80 ? `${md.slice(0, 24)}... (${md.length} characters)` : md.replace(/\t/g, '[TAB]').replace(/\n/g, '\\n');
    const input = make('pre', '', shown);
    const result = make('div', 'result');
    result.setAttribute('inert', '');
    const r = createRenderer(result, { throttleMs: 0 });
    r.write(md);
    r.end();
    results.push(result);
    const lines = [];
    for (const k of result.childNodes) dump(k, 0, lines, 6);
    card.append(make('h3', '', title), input, result, make('pre', 'dom', lines.join('\n') || '(empty)'), make('span', 'ok', verdict));
    cards.append(card);
  }
  cards.addEventListener('click', (e) => {
    if (e.target.closest?.('a')) e.preventDefault(); // the links are real, but a click must not leave the demo
  });
  return results;
}

function showProof(results) {
  const all = results.flatMap((r) => Array.from(r.querySelectorAll('*')));
  const count = (f) => all.filter(f).length;
  const bad = (a) => /^(javascript|data|vbscript):/i.test(a.getAttribute('href') ?? '');
  const imgRequests = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'img').length;
  const rows = [
    ['Scripts', count((n) => n.tagName === 'SCRIPT')],
    ['Images', count((n) => n.tagName === 'IMG')],
    ['Handlers', count((n) => Array.from(n.attributes).some((a) => /^on/i.test(a.name)))],
    ['Bad links', count((n) => n.tagName === 'A' && bad(n))],
    ['Links', count((n) => n.tagName === 'A')],
    ['Image requests', imgRequests],
    ['alert() calls', counters.alerts],
  ];
  const dl = $('#proof');
  dl.replaceChildren();
  for (const [k, v] of rows) {
    const d = make('div');
    d.append(make('dt', '', k), make('dd', '', String(v)));
    dl.append(d);
  }
}

export function initAttack() {
  showProof(buildCards());
  for (const i of document.querySelectorAll('input[name="view"]')) {
    i.addEventListener('click', () => {
      $('#panel-attack').dataset.view = i.value;
    });
  }
}
