import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
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
