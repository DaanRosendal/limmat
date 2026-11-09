// Stream your own markdown: the text stays in this page, and a share link carries up to 4 KB of it.

import { canPlay, syncControls } from './controls.js';
import { notice } from './dom.js';
import { el } from './els.js';
import { closePanel } from './panels.js';
import { reset } from './player.js';
import { writeHash } from './share.js';
import { CUSTOM_MAX, s } from './state.js';
import { STREAMS } from './streams.js';

export function initPaste() {
  el.customGo.addEventListener('click', () => {
    let text = el.customText.value;
    if (text.length > CUSTOM_MAX) {
      text = text.slice(0, CUSTOM_MAX);
      notice(`Cut at ${CUSTOM_MAX.toLocaleString('en')} characters`);
    }
    s.customText = text;
    s.stream = 'custom';
    STREAMS.custom.text = text;
    syncControls();
    writeHash();
    closePanel();
    reset(canPlay());
  });
}
