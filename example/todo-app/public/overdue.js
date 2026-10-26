// 마감 지남 판정 (브라우저·테스트 공용)

// 로컬 날짜 기준 YYYY-MM-DD
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 미완료이고 마감일이 today 이전이면 true
export function isOverdue(todo, today = localToday()) {
  return !todo.done && Boolean(todo.dueDate) && todo.dueDate < today;
}
