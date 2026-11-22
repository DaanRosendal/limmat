// Demo page for limmat: plain ES modules, no bundler, no framework. Everything runs the real built limmat.
import { initInstall, initTheme, showRelease } from './chrome.js';
import { canPlay, initControls, syncControls } from './controls.js';
import { $, reduceMotion } from './dom.js';
import { initEditor } from './editor.js';
import { initPanels } from './panels.js';
import { initPaste } from './paste.js';
import { finish, play, reset } from './player.js';
import { watchOutput } from './readouts.js';
import { copyLink, readHash } from './share.js';
import { counters, s } from './state.js';
import { STREAMS } from './streams.js';
import { initSupport } from './support.js';

window.alert = () => {
  counters.alerts++; // payloads that try alert() are counted, never shown
};

async function start() {
  readHash();
  s.customText = STREAMS.custom.text;
  syncControls();
  initPanels();
  initControls();
  initPaste();
  initEditor();
  initTheme();
  initInstall();
  $('#share').addEventListener('click', copyLink);
  watchOutput();
  initSupport();
  showRelease();
  try {
    s.hl = (await import('../hl/highlight.js')).speedHighlight();
  } catch {
    /* plain code blocks are fine */
  }
  try {
    s.math = (await import('../math/math.js')).math;
    const css = document.createElement('link'); // added from script, so the strict CSP needs nothing more than style-src 'self'
    css.rel = 'stylesheet';
    css.href = 'math/katex.css';
    document.head.append(css);
  } catch {
    /* math stays plain text */
  }
  reset(false);
  if (reduceMotion) {
    // No autoplay with reduced motion: show the finished state and let the visitor press Play.
    finish();
  } else if (canPlay()) play();
  window.__demoReady = true;
}
start();
