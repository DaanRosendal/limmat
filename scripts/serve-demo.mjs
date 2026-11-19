// Serves demo/out locally with the headers from demo/_headers (so the strict Content-Security-Policy applies).
//   npm run demo            build, then serve on http://localhost:4173
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize } from 'node:path';
import { headers, ROOT, typeOf } from './demo-files.mjs';

const port = Number(process.env.PORT) || 4173;

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path === '/' || path === '.' ? 'index.html' : path);
  try {
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    res.writeHead(200, { ...headers, 'Content-Type': typeOf(file) });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404, headers).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`demo on http://localhost:${port}`));
