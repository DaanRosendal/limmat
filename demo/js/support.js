// The support panel: the README's table from the same data, plus the CommonMark counts, with the gaps left in.
import { $, $$, make } from './dom.js';

const LABEL = { supported: 'Supported', partial: 'Partial', 'not-yet': 'Not yet', wont: 'Will not' };

export async function initSupport() {
  const rows = await (await fetch('support.json')).json();
  const tbody = $('#support-table tbody');
  // Rows that cite CommonMark sections come first, with their counts. The rest (GFM, limmat's own features, streaming) have no
  // count, so their notes take the count's column and no cell is left empty.
  const groups = [
    ['commonmark', 'CommonMark', 'examples passed, from spec 0.31.2', rows.filter((r) => r.spec)],
    ['beyond', 'Beyond CommonMark', 'GFM, limmat features, and streaming behaviour', rows.filter((r) => !r.spec)],
  ];
  for (const [key, title, sub, rs] of groups) {
    const head = make('tr', 'support-group');
    head.dataset.groupHead = key;
    const th = make('th', '', title);
    th.colSpan = 4;
    th.scope = 'colgroup';
    th.append(make('small', '', sub));
    head.append(th);
    tbody.append(head);
    for (const r of rs) {
      const tr = make('tr');
      tr.dataset.status = r.status;
      tr.dataset.group = key;
      const status = make('td');
      status.append(make('span', `tag-status ${r.status}`, LABEL[r.status] ?? r.status));
      tr.append(make('td', '', r.feature.replace(/`/g, '')), status);
      if (key === 'commonmark') tr.append(make('td', '', r.spec));
      const note = make('td', '', r.note.replace(/`/g, ''));
      if (key === 'beyond') note.colSpan = 2;
      tr.append(note);
      tbody.append(tr);
    }
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
    for (const tr of tbody.querySelectorAll('tr[data-status]'))
      tr.hidden = b.dataset.filter !== 'all' && tr.dataset.status !== b.dataset.filter;
    for (const head of tbody.querySelectorAll('tr.support-group')) {
      head.hidden = !tbody.querySelector(`tr[data-group="${head.dataset.groupHead}"]:not([hidden])`);
    }
  });
}
