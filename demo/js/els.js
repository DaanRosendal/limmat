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
    chunksTotal: $('#v-chunks-total'),
    bytes: $('#v-bytes'),
    bytesTotal: $('#v-bytes-total'),
    touched: $('#v-touched'),
    nodes: $('#v-nodes'),
    attacksIn: $('#v-in'),
    attacksThrough: $('#v-through'),
  },
  attacksChip: $('#chip-attacks'),
};
