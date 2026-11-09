// The chunking check: stream the same text five ways into hidden containers and compare the final HTML.
import { createRenderer } from '../limmat.min.js';
import { $, make } from './dom.js';
import { openName, whenOpened } from './panels.js';
import { onReset } from './player.js';
import { s } from './state.js';
import { chunkText, STREAMS, textOf } from './streams.js';

function finalHtml(chunks) {
  const box = document.createElement('div');
  const r = createRenderer(box, { throttleMs: 0 });
  for (const c of chunks) r.write(c);
  r.end();
  const out = { html: box.innerHTML, nodes: box.querySelectorAll('*').length, writes: chunks.length };
  r.destroy();
  return out;
}

export function runCheck() {
  const stream = STREAMS[s.stream];
  const text = textOf(stream);
  const tbody = $('#check-table tbody');
  tbody.replaceChildren();
  const len = Array.from(text).length;
  const plans = [['One write', [text]]];
  for (const [label, size, random] of [
    ['1 character at a time', 1, false],
    ['7 characters at a time', 7, false],
    [`Random 1 to 12, seed ${s.seed}`, 12, true],
  ]) {
    if (len / (random ? 6 : size) > 6000) continue; // keep the check quick on very long text
    plans.push([label, chunkText(text, size, random, s.seed)]);
  }
  if (stream.chunks) plans.push(['The scripted cuts', stream.chunks]);
  const whole = finalHtml([text]);
  let same = true;
  for (const [label, chunks] of plans) {
    const res = finalHtml(chunks);
    const ok = res.html === whole.html;
    same &&= ok;
    const tr = make('tr');
    const bar = make('progress');
    bar.max = Math.log10(Math.max(10, whole.writes, ...plans.map(([, c]) => c.length)));
    bar.value = Math.log10(res.writes);
    bar.setAttribute('aria-hidden', 'true');
    const writes = make('td', '', String(res.writes));
    writes.append(bar);
    tr.append(
      make('td', '', label),
      writes,
      make('td', '', String(res.nodes)),
      make('td', ok ? 'yes' : 'no', ok ? 'Identical' : 'DIFFERENT'),
    );
    tbody.append(tr);
  }
  const v = $('#check-verdict');
  v.className = `verdict ${same ? 'ok' : 'bad'}`;
  v.textContent = same ? `All ${plans.length} identical` : 'Chunkings differ: a limmat bug';
}

export function initCheck() {
  whenOpened('check', runCheck);
  $('#run-check').addEventListener('click', runCheck);
  onReset(() => {
    if (openName() === 'check') runCheck();
  });
}
