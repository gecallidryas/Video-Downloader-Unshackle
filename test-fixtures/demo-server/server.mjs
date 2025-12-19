import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'site');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.m3u8', 'application/vnd.apple.mpegurl'],
  ['.mpd', 'application/dash+xml'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.m4s', 'video/iso.segment'],
  ['.ts', 'video/mp2t'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname));

  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return undefined;
  }

  return candidate;
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url ?? '/');

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'x-unshackle-fixture': 'native-ffmpeg-clear-media',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Fixture server listening on http://${host}:${port}`);
});
