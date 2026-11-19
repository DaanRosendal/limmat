// What serve-demo.mjs and record-demo.mjs share: where the built demo is, its content types, and the headers in demo/_headers.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export const ROOT = new URL('../demo/out/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
export const typeOf = (file) => TYPES[extname(file)] ?? 'application/octet-stream';
export const headers = Object.fromEntries(
  readFileSync(`${ROOT}_headers`, 'utf8')
    .split('\n')
    .filter((l) => /^\s+[\w-]+:/.test(l))
    .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
);
