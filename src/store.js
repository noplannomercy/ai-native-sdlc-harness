// JSON 파일 기반 Todo 저장소
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const MAX_TITLE = 200;

export class ValidationError extends Error {}

function validTitle(v) {
  if (typeof v !== 'string') throw new ValidationError('title must be a string');
  const t = v.trim();
  if (!t) throw new ValidationError('title is required');
  if (t.length > MAX_TITLE) throw new ValidationError(`title must be at most ${MAX_TITLE} characters`);
  return t;
}

function validDueDate(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new ValidationError('dueDate must be YYYY-MM-DD or null');
  }
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new ValidationError('dueDate is not a valid date');
  }
  return v;
}

export function createStore(file) {
  let todos = null;
  let queue = Promise.resolve();

  async function load() {
    if (todos) return todos;
    try {
      todos = JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      todos = [];
    }
    return todos;
  }

  // 쓰기는 직렬화하고, 임시 파일에 쓴 뒤 rename으로 교체한다
  function save() {
    const data = JSON.stringify(todos, null, 2);
    queue = queue.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, file);
    });
    return queue;
  }

  return {
    async list() {
      return [...(await load())];
    },

    async create(input = {}) {
      const todo = {
        id: randomUUID(),
        title: validTitle(input.title),
        done: false,
        dueDate: validDueDate(input.dueDate),
        createdAt: new Date().toISOString(),
      };
      (await load()).push(todo);
      await save();
      return todo;
    },

    // 없는 id면 null
    async update(id, patch = {}) {
      const todo = (await load()).find((t) => t.id === id);
      if (!todo) return null;
      const next = {};
      if ('title' in patch) next.title = validTitle(patch.title);
      if ('done' in patch) {
        if (typeof patch.done !== 'boolean') throw new ValidationError('done must be a boolean');
        next.done = patch.done;
      }
      if ('dueDate' in patch) next.dueDate = validDueDate(patch.dueDate);
      Object.assign(todo, next);
      await save();
      return todo;
    },

    // 삭제했으면 true
    async remove(id) {
      const list = await load();
      const i = list.findIndex((t) => t.id === id);
      if (i < 0) return false;
      list.splice(i, 1);
      await save();
      return true;
    },
  };
}
