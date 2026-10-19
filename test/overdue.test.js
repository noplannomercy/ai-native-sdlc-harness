import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue, localToday } from '../public/overdue.js';

const today = '2026-10-19';

test('R13: 미완료 + 어제 마감이면 강조', () => {
  assert.equal(isOverdue({ done: false, dueDate: '2026-10-18' }, today), true);
});

test('R13: 오늘 마감·미래 마감은 강조 안 함', () => {
  assert.equal(isOverdue({ done: false, dueDate: today }, today), false);
  assert.equal(isOverdue({ done: false, dueDate: '2026-10-20' }, today), false);
});

test('R13: 완료 항목·마감 없음은 강조 안 함', () => {
  assert.equal(isOverdue({ done: true, dueDate: '2026-10-18' }, today), false);
  assert.equal(isOverdue({ done: false, dueDate: null }, today), false);
});

test('localToday는 로컬 날짜를 YYYY-MM-DD로', () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
