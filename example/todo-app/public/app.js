// 할 일 화면 — 모든 변경은 API 응답 후 다시 그린다. DOM은 textContent로만 채운다(XSS 방지).
import { isOverdue, localToday } from './overdue.js';

const $list = document.getElementById('list');
const $form = document.getElementById('new');
const $error = document.getElementById('error');
const $filters = document.querySelectorAll('[data-filter]');

let todos = [];
let filter = 'all'; // 새로고침 시 항상 전체 (R12)

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// 실패하면 메시지를 보여주고 서버 상태로 다시 맞춘다
async function run(fn) {
  $error.textContent = '';
  try {
    await fn();
  } catch (e) {
    $error.textContent = e.message;
  }
  await refresh();
}

async function refresh() {
  try {
    todos = await api('GET', '/api/todos');
  } catch (e) {
    $error.textContent = e.message;
  }
  render();
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function startEdit(todo, $title) {
  const input = el('input', { value: todo.title, maxLength: 200 });
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    const title = input.value.trim();
    if (save && title !== todo.title) run(() => api('PATCH', `/api/todos/${todo.id}`, { title }));
    else render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(false));
  $title.replaceChildren(input);
  input.focus();
  input.select();
}

function item(todo, today) {
  const $check = el('input', { type: 'checkbox', checked: todo.done, title: '완료' });
  $check.addEventListener('change', () => run(() => api('PATCH', `/api/todos/${todo.id}`, { done: $check.checked })));

  const $title = el('span', { className: 'title', textContent: todo.title, title: '더블클릭하여 수정' });
  $title.addEventListener('dblclick', () => startEdit(todo, $title));

  const $due = el('input', { type: 'date', className: 'due', value: todo.dueDate || '', title: '마감일' });
  $due.addEventListener('change', () =>
    run(() => api('PATCH', `/api/todos/${todo.id}`, { dueDate: $due.value || null })),
  );

  const $del = el('button', { className: 'delete', textContent: '✕', title: '삭제' });
  $del.addEventListener('click', () => run(() => api('DELETE', `/api/todos/${todo.id}`)));

  const $li = el('li', {}, $check, $title, $due, $del);
  $li.classList.toggle('done', todo.done);
  $li.classList.toggle('overdue', isOverdue(todo, today));
  return $li;
}

function render() {
  const today = localToday();
  const shown = todos.filter((t) => filter === 'all' || (filter === 'done' ? t.done : !t.done));
  $list.replaceChildren(
    ...(shown.length ? shown.map((t) => item(t, today)) : [el('li', { className: 'empty', textContent: '할 일이 없습니다' })]),
  );
  $filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
}

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  // form.title은 HTMLElement.title 속성과 겹치므로 elements로 접근
  const title = $form.elements.namedItem('title').value.trim();
  if (!title) return;
  const dueDate = $form.elements.namedItem('dueDate').value || null;
  run(async () => {
    await api('POST', '/api/todos', { title, dueDate });
    $form.reset();
  });
});

$filters.forEach((b) =>
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    render();
  }),
);

refresh();
