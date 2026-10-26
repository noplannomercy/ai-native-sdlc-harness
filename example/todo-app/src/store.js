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
  let loading = null;
  let queue = Promise.resolve();

  // 동시 첫 요청이 각자 파일을 읽어 덮어쓰지 않도록 로드 Promise를 공유한다
  function load() {
    loading ??= readFile(file, 'utf8').then(
      (s) => (todos = JSON.parse(s)),
      (e) => {
        if (e.code !== 'ENOENT') {
          loading = null;
          throw e;
        }
        return (todos = []);
      },
    );
    return loading;
  }

  async function write(list) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(list, null, 2));
    await rename(tmp, file);
  }

  // 변경은 직렬화하고, 복사본을 파일에 쓴 뒤에만 메모리에 반영한다.
  // 한 번 실패해도 다음 변경은 계속 진행된다.
  function mutate(fn) {
    const run = queue.then(async () => {
      await load();
      const next = todos.map((t) => ({ ...t }));
      const result = fn(next);
      if (result === undefined) return undefined;
      await write(next);
      todos = next;
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    async list() {
      await queue;
      await load();
      return todos.map((t) => ({ ...t }));
    },

    create(input = {}) {
      return mutate((list) => {
        const todo = {
          id: randomUUID(),
          title: validTitle(input.title),
          done: false,
          dueDate: validDueDate(input.dueDate),
          createdAt: new Date().toISOString(),
        };
        list.push(todo);
        return { ...todo };
      });
    },

    // 없는 id면 null
    async update(id, patch = {}) {
      const result = await mutate((list) => {
        const todo = list.find((t) => t.id === id);
        if (!todo) return undefined;
        const next = {};
        if ('title' in patch) next.title = validTitle(patch.title);
        if ('done' in patch) {
          if (typeof patch.done !== 'boolean') throw new ValidationError('done must be a boolean');
          next.done = patch.done;
        }
        if ('dueDate' in patch) next.dueDate = validDueDate(patch.dueDate);
        Object.assign(todo, next);
        return { ...todo };
      });
      return result ?? null;
    },

    // 삭제했으면 true
    async remove(id) {
      const result = await mutate((list) => {
        const i = list.findIndex((t) => t.id === id);
        if (i < 0) return undefined;
        list.splice(i, 1);
        return true;
      });
      return result ?? false;
    },
  };
}
