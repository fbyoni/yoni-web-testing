import {createServer} from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {join, normalize, resolve} from 'node:path';

const root = resolve('site');
const port = Number(process.env.PORT || 5173);

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.mp4', 'video/mp4']
]);

function contentType(pathname) {
  const dot = pathname.lastIndexOf('.');
  return dot === -1 ? 'application/octet-stream' : types.get(pathname.slice(dot).toLowerCase()) || 'application/octet-stream';
}

function fileForRequest(url) {
  const parsed = new URL(url, `http://localhost:${port}`);
  const decoded = decodeURIComponent(parsed.pathname);
  const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let candidate = join(root, safePath);

  if (!candidate.startsWith(root)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    candidate = join(candidate, 'index.html');
  } else if (!existsSync(candidate) && !safePath.includes('.')) {
    candidate = join(root, safePath, 'index.html');
  }

  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
}

createServer((req, res) => {
  const file = fileForRequest(req.url || '/');
  if (!file) {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': contentType(file),
    'cache-control': 'no-store, max-age=0'
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
