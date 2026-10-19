---
slug: todo-app
spec: specs/todo-app.md
---

# 개인용 할 일 관리 웹앱 — Plan

## Context
`intent/todo-app.md`(accepted)와 `specs/todo-app.md`(accepted, R1~R13)를 구현한다. 현재 `src/` `public/` `test/`는 비어 있다. 이 문서는 승인 후 `plans/todo-app.md`로 그대로 커밋한다.

## 변경 파일
| 파일 | 변경 내용 |
|---|---|
| `.gitignore` | 신규. `data/` 제외 |
| `src/store.js` | 신규. `createStore(file)` → `{ list, create, update, remove }`. 파일이 없으면 `[]`, 쓰기는 `file.tmp` 작성 후 `fs.rename`. 검증(`validate`)도 여기: 제목 trim·1~200자, `dueDate`는 `/^\d{4}-\d{2}-\d{2}$/` + 유효 날짜 또는 `null`, `done`은 boolean. 위반 시 `ValidationError` throw |
| `src/server.js` | 신규. `createServer({ dataFile, publicDir })` export (`node:http`). 라우팅: `/api/todos`(GET/POST), `/api/todos/:id`(PATCH/DELETE), 그 외 GET은 정적 파일. 정적 서빙은 `path.resolve` 후 `publicDir` 하위인지 확인, 아니면 404. JSON 본문 파싱 실패 → 400. `import.meta.url`로 직접 실행 감지 시 `PORT`(기본 3000), `data/todos.json`으로 listen |
| `public/index.html` | 신규. 입력 폼(제목 + date), 필터 버튼 3개, 목록 `<ul>`, 인라인 CSS(`.done` 취소선, `.overdue` 빨강) |
| `public/app.js` | 신규 (ES module). fetch로 API 호출 → 응답 후 `render()`. DOM은 `textContent`/`createElement`만 사용(innerHTML 금지, XSS). 더블클릭 편집(Enter 저장/Esc 취소), 필터는 메모리 변수만 |
| `public/overdue.js` | 신규. `isOverdue(todo, today)` — `!todo.done && todo.dueDate && todo.dueDate < today` (`today`는 `YYYY-MM-DD` 문자열). `localToday()` 헬퍼 포함 |
| `test/store.test.js` | 신규. 임시 디렉터리(`fs.mkdtemp`)에 저장소 생성 |
| `test/api.test.js` | 신규. `createServer`를 포트 0으로 listen, 내장 `fetch`로 요청 |
| `test/overdue.test.js` | 신규 |

## 작업 순서
1. `feat/todo-app` 브랜치 생성 (`git switch -c`), 이 계획을 `plans/todo-app.md`로 커밋 (`plan: todo-app`)
2. `.gitignore` + `src/store.js` + `test/store.test.js` → `npm test` 통과 후 커밋
3. `src/server.js` + `test/api.test.js` → 통과 후 커밋
4. `public/overdue.js` + `test/overdue.test.js` → 커밋
5. `public/index.html` + `public/app.js` → 커밋
6. `npm test`, `npm run check`, `npm start` + `curl -s localhost:3000/api/todos` 확인
7. `reviewer` 에이전트로 diff 리뷰 → Important 해결
8. `verifier` 에이전트로 증명 항목 검증 → 결과 그대로 보고 (main 머지는 사용자 결정)

※ pre-commit이 `npm test`를 돌리므로 테스트와 구현은 같은 커밋에 넣는다 (실패 테스트 선커밋은 `fix/` 브랜치 규칙이며 이번엔 해당 없음).

## 리스크
- Windows에서 `fs.rename`이 대상 파일 존재 시 드물게 EPERM — 발생하면 재시도 로직 추가 (계획 갱신 후)
- 동시 요청 시 쓰기 경합: 단일 사용자 전제, 저장소 내부 쓰기를 Promise 체인으로 직렬화해 완화
- 직접 실행 감지(`import.meta.url` vs `process.argv[1]`) Windows 경로 차이 → `pathToFileURL(process.argv[1]).href`로 비교
- R11·R12(화면)는 자동 테스트 없음 → 수동 확인 항목으로 남김

## 증명 (어떤 테스트가 어떤 요구사항을 확인하는가)
| 요구사항 | 테스트 |
|---|---|
| R1 | `test/api.test.js` — 빈 저장소 GET → 200, JSON, `[]`; 2개 추가 후 생성순 반환 |
| R2 | `test/api.test.js` — POST → 201, `id`·`done:false`, 이후 GET 포함 |
| R3 | `test/api.test.js` — 빈/공백 제목, 201자 제목 → 400, GET에 없음; PATCH 빈 제목 → 400 |
| R4 | `test/api.test.js` — PATCH `{done:true}` → 200 `done:true`, 다시 `false` |
| R5 | `test/api.test.js` — PATCH `{title}` → 200, 변경됨 |
| R6 | `test/api.test.js` — POST `dueDate:"2026-10-20"` 저장, PATCH `null` 해제, `"2026/10/20"`·`"2026-13-01"` → 400 |
| R7 | `test/api.test.js` — DELETE → 204, 이후 GET에 없음 |
| R8 | `test/api.test.js` — 없는 id PATCH/DELETE → 404 |
| R9 | `test/store.test.js` — 같은 파일로 `createStore` 재생성 시 항목 유지; 파일 없으면 `[]` |
| R10 | `test/api.test.js` — `GET /` → 200 `text/html`; `/../package.json`·`/%2e%2e/package.json` → 404 |
| R11 | 수동 — 브라우저에서 추가/체크/편집/마감일/삭제, 완료 취소선 |
| R12 | 수동 — 필터 3종 전환, 새로고침 시 "전체" |
| R13 | `test/overdue.test.js` — 미완료+어제 마감 true, 오늘 마감 false, 완료 false, 마감 없음 false |

## 검증 (완료 조건)
- `npm test` exit 0, `npm run check` exit 0
- `npm start` 후 `curl -s localhost:3000/api/todos` → JSON
- verifier 에이전트 보고를 그대로 전달
