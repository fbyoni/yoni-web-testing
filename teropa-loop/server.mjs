import {createServer} from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {join, normalize, resolve} from 'node:path';

// SITE_DIR override lets us serve alternate copies (e.g. a readable build);
// defaults to ./site. PORT override lets two copies run side by side.
const root = resolve(process.env.SITE_DIR || 'site');
// Dedicated port (the other replicas in this repo default to 5173).
const port = Number(process.env.PORT || 5180);

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
  ['.otf', 'font/otf'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.m4a', 'audio/mp4'],
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
  const rawUrl = req.url || '/';
  const parsed = new URL(rawUrl, `http://localhost:${port}`);

  // Bare root -> the presentation lives under /loop/.
  if (parsed.pathname === '/') {
    res.writeHead(308, {location: '/loop/'});
    res.end();
    return;
  }

  // Canonicalize any path that ends in /index.html to the parent directory.
  if (parsed.pathname.endsWith('/index.html')) {
    const target = parsed.pathname.slice(0, -'index.html'.length) + parsed.search;
    res.writeHead(308, {location: target});
    res.end();
    return;
  }

  const file = fileForRequest(rawUrl);
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
  console.log(`Serving ${root} at http://localhost:${port}  (open http://localhost:${port}/loop/)`);
});
