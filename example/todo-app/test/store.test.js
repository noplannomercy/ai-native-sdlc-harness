import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore, ValidationError } from '../src/store.js';

const tmpFile = async () => path.join(await mkdtemp(path.join(tmpdir(), 'todo-')), 'todos.json');

test('파일이 없으면 빈 목록', async () => {
  const store = createStore(await tmpFile());
  assert.deepEqual(await store.list(), []);
});

test('R9: 같은 파일로 다시 열면 항목이 유지된다', async () => {
  const file = await tmpFile();
  const a = createStore(file);
  const t = await a.create({ title: '우유 사기', dueDate: '2026-10-20' });
  await a.update(t.id, { done: true });

  const b = createStore(file);
  assert.deepEqual(await b.list(), [{ ...t, done: true }]);
});

test('검증 실패는 ValidationError이고 저장하지 않는다', async () => {
  const store = createStore(await tmpFile());
  await assert.rejects(store.create({ title: '  ' }), ValidationError);
  await assert.rejects(store.create({ title: 'x', dueDate: '2026-02-30' }), ValidationError);
  assert.deepEqual(await store.list(), []);
});

test('첫 로드 중 동시 생성도 모두 저장된다', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await Promise.all([store.create({ title: 'a' }), store.create({ title: 'b' })]);
  assert.equal((await store.list()).length, 2);
  assert.equal((await createStore(file).list()).length, 2);
});

test('쓰기 실패 후에도 다음 쓰기는 성공하고, 실패한 변경은 메모리에 남지 않는다', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await mkdir(`${file}.tmp`);
  await assert.rejects(store.create({ title: '실패' }));
  assert.deepEqual(await store.list(), []);

  await rmdir(`${file}.tmp`);
  await store.create({ title: '성공' });
  assert.deepEqual((await store.list()).map((t) => t.title), ['성공']);
  assert.deepEqual((await createStore(file).list()).map((t) => t.title), ['성공']);
});
