// Panels laid over the panes (support and paste).
import { $, $$ } from './dom.js';

const panes = $$('.pane');
const tabs = $$('.tab');
let current = null;
let opener = null;

export const openName = () => current;

export function closePanel(returnFocus = true) {
  if (!current) return;
  const panel = $(`#panel-${current}`);
  panel.classList.remove('open');
  panel.inert = true;
  for (const p of panes) p.inert = false;
  for (const t of tabs) t.setAttribute('aria-expanded', 'false');
  current = null;
  if (returnFocus && opener?.isConnected) opener.focus();
  opener = null;
}

export function openPanel(name, from = document.activeElement) {
  if (current === name) return;
  const sameOpener = current !== null;
  if (current) closePanel(false);
  opener = sameOpener ? opener : from;
  const panel = $(`#panel-${name}`);
  current = name;
  panel.inert = false;
  panel.classList.add('open');
  for (const p of panes) p.inert = true;
  for (const t of tabs) t.setAttribute('aria-expanded', String(t.dataset.panel === name));
  (name === 'paste' ? $('#custom-text') : $('.close', panel)).focus({ preventScroll: true });
}

export function initPanels() {
  for (const t of tabs) t.addEventListener('click', () => (current === t.dataset.panel ? closePanel() : openPanel(t.dataset.panel, t)));
  for (const b of $$('[data-close]')) b.addEventListener('click', () => closePanel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });
}
