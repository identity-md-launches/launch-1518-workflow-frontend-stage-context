import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const dist = resolve(fileURLToPath(new URL('../../dist/', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { Location: '/preview/' }); res.end(); return; }
    if (!url.pathname.startsWith('/preview/')) { res.writeHead(404); res.end('Not found'); return; }
    const path = resolve(dist, decodeURIComponent(url.pathname.slice('/preview/'.length)) || 'index.html');
    if (!path.startsWith(dist + sep) && path !== resolve(dist, 'index.html')) throw new Error('Invalid path');
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173/preview/'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
