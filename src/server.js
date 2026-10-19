// node:http 서버 — /api/todos REST + public/ 정적 파일
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStore, ValidationError } from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'body too large');
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'body must be a JSON object');
  }
  return body;
}

async function serveStatic(publicDir, pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(404, 'not found');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(publicDir, '.' + rel);
  // public/ 밖으로 나가는 경로는 거부 (경로 탐색 방지)
  if (!file.startsWith(publicDir + path.sep) || rel.includes('\0')) throw new HttpError(404, 'not found');
  let data;
  try {
    data = await readFile(file);
  } catch {
    throw new HttpError(404, 'not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(data);
}

export function createServer({ dataFile, publicDir = path.join(ROOT, 'public') } = {}) {
  const store = createStore(dataFile);
  const pub = path.resolve(publicDir);

  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (pathname === '/api/todos') {
        if (req.method === 'GET') return send(res, 200, await store.list());
        if (req.method === 'POST') return send(res, 201, await store.create(await readJson(req)));
        throw new HttpError(405, 'method not allowed');
      }

      const m = pathname.match(/^\/api\/todos\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (req.method === 'PATCH') {
          const todo = await store.update(id, await readJson(req));
          if (!todo) throw new HttpError(404, 'todo not found');
          return send(res, 200, todo);
        }
        if (req.method === 'DELETE') {
          if (!(await store.remove(id))) throw new HttpError(404, 'todo not found');
          return send(res, 204);
        }
        throw new HttpError(405, 'method not allowed');
      }

      if (pathname.startsWith('/api/')) throw new HttpError(404, 'not found');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
      await serveStatic(pub, pathname, res);
    } catch (e) {
      if (e instanceof ValidationError) return send(res, 400, { error: e.message });
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'internal error' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createServer({ dataFile: path.join(ROOT, 'data', 'todos.json') }).listen(port, () => {
    console.log(`listening on http://localhost:${port}`);
  });
}
