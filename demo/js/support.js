// The support panel: the README's table from the same data, plus the CommonMark counts, with the gaps left in.
import { $, $$, make } from './dom.js';

const LABEL = { supported: 'Supported', partial: 'Partial', 'not-yet': 'Not yet', wont: 'Will not' };

export async function initSupport() {
  const rows = await (await fetch('support.json')).json();
  const tbody = $('#support-table tbody');
  for (const r of rows) {
    const tr = make('tr');
    tr.dataset.status = r.status;
    const status = make('td');
    status.append(make('span', `tag-status ${r.status}`, LABEL[r.status] ?? r.status));
    tr.append(make('td', '', r.feature.replace(/`/g, '')), status, make('td', '', r.spec), make('td', '', r.note.replace(/`/g, '')));
    tbody.append(tr);
  }
  const filters = $('#filters');
  for (const [key, label] of [['all', 'All'], ...Object.entries(LABEL)]) {
    const n = key === 'all' ? rows.length : rows.filter((r) => r.status === key).length;
    if (!n) continue;
    const b = make('button', '', label);
    b.type = 'button';
    b.dataset.filter = key;
    b.setAttribute('aria-pressed', String(key === 'all'));
    b.append(make('b', '', String(n)));
    filters.append(b);
  }
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const o of $$('button', filters)) o.setAttribute('aria-pressed', String(o === b));
    for (const tr of tbody.children) tr.hidden = b.dataset.filter !== 'all' && tr.dataset.status !== b.dataset.filter;
  });
}
