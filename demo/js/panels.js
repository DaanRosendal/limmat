// Panels laid over the panes (chunking check, attack, support, paste) and the small header menu.
import { $, $$ } from './dom.js';

const panes = $$('.pane');
const tabs = $$('.tab');
const onOpen = {};
let current = null;
let opener = null;

/** Run `fn` each time the named panel opens. */
export const whenOpened = (name, fn) => {
  onOpen[name] = fn;
};
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
  closeMenu();
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
  onOpen[name]?.();
  (name === 'paste' ? $('#custom-text') : $('.close', panel)).focus({ preventScroll: true });
}

const menu = $('#menu');
const menuBtn = $('#menu-btn');
function closeMenu() {
  menu.classList.remove('open');
  menu.inert = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}
function toggleMenu() {
  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  menu.inert = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) $('button', menu).focus();
}

export function initPanels() {
  for (const t of tabs) t.addEventListener('click', () => (current === t.dataset.panel ? closePanel() : openPanel(t.dataset.panel, t)));
  for (const b of $$('[data-close]')) b.addEventListener('click', () => closePanel());
  menuBtn.addEventListener('click', toggleMenu);
  $('#paste-open').addEventListener('click', () => openPanel('paste', menuBtn));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (menu.classList.contains('open')) {
      closeMenu();
      menuBtn.focus();
    } else closePanel();
  });
}
