// R11·R12 화면 e2e — headless Chrome에서 실제 입력으로 조작하고 화면과 API를 함께 확인한다
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { localToday } from '../public/overdue.js';
import { launchChrome } from './cdp.js';

const RED = 'rgb(198, 40, 40)';

// 실행 날짜 기준 상대 날짜
const now = new Date();
const dayOffset = (n) => localToday(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
const YESTERDAY = dayOffset(-1);
const NEXT_WEEK = dayOffset(6);
const LATER = dayOffset(10);

let server;
let dataDir;
let base;
let page;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'todo-e2e-data-'));
  server = createServer({ dataFile: path.join(dataDir, 'todos.json') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  page = await launchChrome();
  await page.goto(base + '/');
  await page.waitFor(`document.querySelector('#list .empty')`);
});

after(async () => {
  await page?.close();
  if (server) await new Promise((r) => server.close(r));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

const api = async () => (await fetch(base + '/api/todos')).json();

const ROWS = `[...document.querySelectorAll('#list li:not(.empty)')].map((li) => {
  const title = li.querySelector('.title');
  const style = getComputedStyle(title);
  return {
    title: title.textContent,
    editing: !!title.querySelector('input'),
    done: li.classList.contains('done'),
    overdue: li.classList.contains('overdue'),
    checked: li.querySelector('input[type=checkbox]').checked,
    due: li.querySelector('.due').value,
    deco: style.textDecorationLine,
    color: style.color,
  };
})`;
const rows = () => page.evaluate(ROWS);
const row = (n) => `#list li:nth-child(${n})`;

// 화면 상태가 조건을 만족할 때까지 기다린다 (cond는 rows 배열 r에 대한 JS 식)
const waitRows = (cond) => page.waitFor(`(() => { const r = ${ROWS}; return (${cond}) ? r : null; })()`);

// 날짜 입력은 로케일마다 키보드 형식이 달라 값 설정 + change 이벤트로 조작한다
const setDate = (selector, value) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

const pressedFilter = () => page.evaluate(`document.querySelector('[aria-pressed=true]').dataset.filter`);

// 테스트는 순서대로 실행되며 같은 페이지 상태를 공유한다
test('R11: 추가 — Enter(마감일 없음)와 추가 버튼(마감일 있음)', async () => {
  await page.click('#new input[name=title]');
  await page.type('우유 사기');
  await page.press('Enter');
  await waitRows(`r.length === 1`);

  await page.click('#new input[name=title]');
  await page.type('보고서 제출');
  await setDate('#new input[name=dueDate]', YESTERDAY);
  await page.click('#new button');
  await waitRows(`r.length === 2`);

  await page.click('#new input[name=title]');
  await page.type('운동하기');
  await setDate('#new input[name=dueDate]', NEXT_WEEK);
  await page.click('#new button');
  const r = await waitRows(`r.length === 3`);

  assert.deepEqual(r.map((x) => [x.title, x.due]), [
    ['우유 사기', ''],
    ['보고서 제출', YESTERDAY],
    ['운동하기', NEXT_WEEK],
  ]);
  assert.deepEqual((await api()).map((t) => [t.title, t.dueDate, t.done]), [
    ['우유 사기', null, false],
    ['보고서 제출', YESTERDAY, false],
    ['운동하기', NEXT_WEEK, false],
  ]);
  assert.equal(await page.evaluate(`document.querySelector('#new input[name=title]').value`), '');
});

test('R11/R13: 마감 지난 미완료 항목만 빨간색', async () => {
  const r = await rows();
  assert.deepEqual(r.map((x) => x.overdue), [false, true, false]);
  assert.equal(r[1].color, RED);
  assert.notEqual(r[2].color, RED);
});

test('R11: 완료 체크 시 취소선, 해제 시 원복', async () => {
  await page.click(`${row(1)} input[type=checkbox]`);
  let r = await waitRows(`r[0].done`);
  assert.equal(r[0].checked, true);
  assert.equal(r[0].deco, 'line-through');
  assert.equal((await api())[0].done, true);

  await page.click(`${row(1)} input[type=checkbox]`);
  r = await waitRows(`!r[0].done`);
  assert.equal(r[0].deco, 'none');
  assert.equal((await api())[0].done, false);

  // 마감 지난 항목도 완료하면 강조하지 않는다
  await page.click(`${row(2)} input[type=checkbox]`);
  r = await waitRows(`r[1].done`);
  assert.equal(r[1].overdue, false);
  await page.click(`${row(2)} input[type=checkbox]`);
  r = await waitRows(`!r[1].done`);
  assert.equal(r[1].overdue, true);

  // 필터 테스트를 위해 첫 항목은 완료 상태로 둔다
  await page.click(`${row(1)} input[type=checkbox]`);
  await waitRows(`r[0].done`);
});

test('R11: 더블클릭 수정 — Enter 저장', async () => {
  await page.click(`${row(3)} .title`, { clickCount: 2 });
  await waitRows(`r[2].editing`);
  await page.type('저녁 운동 30분');
  await page.press('Enter');
  const r = await waitRows(`!r[2].editing && r[2].title === '저녁 운동 30분'`);
  assert.equal(r[2].title, '저녁 운동 30분');
  assert.equal((await api())[2].title, '저녁 운동 30분');
});

test('R11: 더블클릭 수정 — Esc 취소', async () => {
  const before = await api();
  await page.click(`${row(2)} .title`, { clickCount: 2 });
  await waitRows(`r[1].editing`);
  await page.type('취소될 텍스트');
  await page.press('Escape');
  const r = await waitRows(`!r[1].editing`);
  assert.equal(r[1].title, '보고서 제출');
  assert.deepEqual(await api(), before);
});

test('R11: 마감일 변경·해제', async () => {
  await setDate(`${row(2)} .due`, LATER);
  let r = await waitRows(`r[1].due === ${JSON.stringify(LATER)} && !r[1].overdue`);
  assert.equal(r[1].color === RED, false);
  assert.equal((await api())[1].dueDate, LATER);

  await setDate(`${row(3)} .due`, '');
  r = await waitRows(`r[2].due === ''`);
  assert.equal((await api())[2].dueDate, null);
});

test('R12: 필터 진행/완료/전체', async () => {
  await page.click('[data-filter=active]');
  let r = await waitRows(`r.length === 2`);
  assert.deepEqual(r.map((x) => x.title), ['보고서 제출', '저녁 운동 30분']);
  assert.equal(await pressedFilter(), 'active');

  await page.click('[data-filter=done]');
  r = await waitRows(`r.length === 1`);
  assert.deepEqual(r.map((x) => x.title), ['우유 사기']);
  assert.equal(await pressedFilter(), 'done');

  await page.click('[data-filter=all]');
  r = await waitRows(`r.length === 3`);
  assert.equal(await pressedFilter(), 'all');
});

test('R12: 새로고침 시 필터는 전체로 초기화, 항목은 유지', async () => {
  await page.click('[data-filter=done]');
  await waitRows(`r.length === 1`);
  await page.reload();
  const r = await waitRows(`r.length === 3`);
  assert.equal(await pressedFilter(), 'all');
  assert.deepEqual(r.map((x) => x.title), ['우유 사기', '보고서 제출', '저녁 운동 30분']);
});

test('R11: 삭제', async () => {
  await page.click(`${row(3)} .delete`);
  let r = await waitRows(`r.length === 2`);
  assert.deepEqual(r.map((x) => x.title), ['우유 사기', '보고서 제출']);
  assert.deepEqual((await api()).map((t) => t.title), ['우유 사기', '보고서 제출']);

  await page.click(`${row(1)} .delete`);
  await waitRows(`r.length === 1`);
  await page.click(`${row(1)} .delete`);
  await page.waitFor(`document.querySelector('#list .empty')?.textContent === '할 일이 없습니다'`);
  assert.deepEqual(await api(), []);
});
