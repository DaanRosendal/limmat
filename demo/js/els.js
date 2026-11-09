// Every element the modules touch, looked up once.
import { $ } from './dom.js';

export const el = {
  out: $('#out'),
  raw: $('#raw'),
  rawEdit: $('#raw-edit'),
  editHint: $('#edit-hint'),
  play: $('#play'),
  step: $('#step'),
  finish: $('#finish'),
  restart: $('#restart'),
  pos: $('#pos'),
  posOut: $('#pos-out'),
  openChip: $('#open-readout'),
  customText: $('#custom-text'),
  customGo: $('#custom-go'),
  v: {
    chunks: $('#v-chunks'),
    bytes: $('#v-bytes'),
    scripts: $('#chip-scripts b'),
    images: $('#chip-images b'),
    handlers: $('#chip-handlers b'),
    bad: $('#chip-bad b'),
    ms: $('#chip-ms b'),
  },
};
