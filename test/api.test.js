import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.js';

let server;
let base;
let port;

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'todo-api-'));
  server = createServer({ dataFile: path.join(dir, 'todos.json') });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
  base = `http://localhost:${port}`;
});

after(() => new Promise((r) => server.close(r)));

const api = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), body: text ? JSON.parse(text) : null };
};

// fetch는 /../ 를 정규화하므로 원본 경로 그대로 보낸다
const rawGet = (rawPath) =>
  new Promise((resolve, reject) => {
    http.get({ port, path: rawPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });

const ids = async () => (await api('GET', '/api/todos')).body.map((t) => t.id);

// 테스트는 순서대로 실행되며 같은 서버 상태를 공유한다
test('R1: 빈 저장소는 [] JSON', async () => {
  const r = await api('GET', '/api/todos');
  assert.equal(r.status, 200);
  assert.match(r.type, /^application\/json/);
  assert.deepEqual(r.body, []);
});

test('R2/R1: POST 후 GET에 생성순으로 포함', async () => {
  const a = await api('POST', '/api/todos', { title: '  첫째  ' });
  assert.equal(a.status, 201);
  assert.equal(a.body.title, '첫째');
  assert.equal(a.body.done, false);
  assert.equal(a.body.dueDate, null);
  assert.ok(a.body.id);
  const b = await api('POST', '/api/todos', { title: '둘째' });
  assert.deepEqual(await ids(), [a.body.id, b.body.id]);
});

test('R3: 빈 제목·201자 제목은 400, 저장 안 됨', async () => {
  const before = await ids();
  for (const title of ['', '   ', 'x'.repeat(201), undefined]) {
    const r = await api('POST', '/api/todos', { title });
    assert.equal(r.status, 400, `title=${JSON.stringify(title)}`);
    assert.ok(r.body.error);
  }
  assert.equal((await api('POST', '/api/todos', { title: 'x'.repeat(200) })).status, 201);
  assert.equal((await ids()).length, before.length + 1);

  const r = await api('PATCH', `/api/todos/${before[0]}`, { title: ' ' });
  assert.equal(r.status, 400);
  const list = (await api('GET', '/api/todos')).body;
  assert.equal(list[0].title, '첫째');
});

test('R4: 완료 체크/해제', async () => {
  const [id] = await ids();
  let r = await api('PATCH', `/api/todos/${id}`, { done: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.done, true);
  r = await api('PATCH', `/api/todos/${id}`, { done: false });
  assert.equal(r.body.done, false);
  assert.equal((await api('PATCH', `/api/todos/${id}`, { done: 'yes' })).status, 400);
});

test('R5: 제목 수정', async () => {
  const [id] = await ids();
  const r = await api('PATCH', `/api/todos/${id}`, { title: '바뀐 제목' });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, '바뀐 제목');
});

test('R6: 마감일 지정/해제/형식 오류', async () => {
  const c = await api('POST', '/api/todos', { title: '마감', dueDate: '2026-10-20' });
  assert.equal(c.status, 201);
  assert.equal(c.body.dueDate, '2026-10-20');
  const r = await api('PATCH', `/api/todos/${c.body.id}`, { dueDate: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.dueDate, null);
  for (const dueDate of ['2026/10/20', '2026-13-01', '2026-02-30', 20261020]) {
    assert.equal((await api('POST', '/api/todos', { title: 't', dueDate })).status, 400, String(dueDate));
    assert.equal((await api('PATCH', `/api/todos/${c.body.id}`, { dueDate })).status, 400, String(dueDate));
  }
});

test('R7: 삭제 → 204, 이후 GET에 없음', async () => {
  const [id] = await ids();
  const r = await api('DELETE', `/api/todos/${id}`);
  assert.equal(r.status, 204);
  assert.ok(!(await ids()).includes(id));
});

test('R8: 없는 id는 404', async () => {
  assert.equal((await api('PATCH', '/api/todos/nope', { done: true })).status, 404);
  assert.equal((await api('DELETE', '/api/todos/nope')).status, 404);
});

test('잘못된 JSON 본문은 400', async () => {
  const res = await fetch(base + '/api/todos', { method: 'POST', body: '{oops' });
  assert.equal(res.status, 400);
  const arr = await api('POST', '/api/todos', ['x']);
  assert.equal(arr.status, 400);
});

test('R10: / 는 HTML, public 밖 경로는 404', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/..%5cpackage.json', '/nope.html']) {
    assert.equal(await rawGet(p), 404, p);
  }
});
