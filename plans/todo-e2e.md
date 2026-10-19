---
slug: todo-e2e
spec: specs/todo-app.md
---

# 화면 동작(R11·R12) 자동 e2e — Plan

## Context
`specs/todo-app.md`의 R11·R12는 지금까지 수동 확인(2026-10-19 claude-in-chrome) 항목이었다. 사용자 지시로 intent는 생략했고, spec의 확인 방법만 "e2e: `npm run e2e`, `e2e/ui.e2e.js`"로 바꿔 커밋했다(`9d466c6`, `feat/todo-e2e`). 열린 질문 결정: 파일 `e2e/ui.e2e.js`, 마감 지남은 상대 날짜, Chrome 탐색은 Windows만. npm 의존성 금지라 headless Chrome을 Node 내장 `WebSocket`으로 DevTools Protocol(CDP)을 직접 다룬다. 이 문서는 승인 후 `plans/todo-e2e.md`로 커밋한다.

## 변경 파일
| 파일 | 변경 내용 |
|---|---|
| `package.json` | scripts에 `"e2e": "node --test --test-timeout=30000 e2e/ui.e2e.js"` 추가 (테스트·훅이 무한 대기하지 않게 30초 제한) (`npm test`의 기본 탐색 패턴 `**/*.test.js`, `test/**`에 걸리지 않음) |
| `e2e/cdp.js` | 신규. 최소 CDP 클라이언트. `findChrome()`: `CHROME_PATH` → `%ProgramFiles%`, `%ProgramFiles(x86)%`, `%LOCALAPPDATA%`의 `Google\Chrome\Application\chrome.exe`. 없으면 경로 안내 메시지로 throw. `launchChrome()`: 임시 `--user-data-dir`(`todo-e2e-*`), `--headless=new --remote-debugging-port=0 --no-first-run --no-default-browser-check`로 spawn하고, stderr의 `DevTools listening on ws://…`에서 포트를 얻은 뒤 `/json/list`의 page 타깃에 `WebSocket`으로 연결. `send(method, params)`(id↔Promise), `once(event)`. 헬퍼: `evaluate(expr)`(awaitPromise, returnByValue), `waitFor(expr, timeout=5000)`(폴링), `click(selector, {clickCount})`(getBoundingClientRect 중심에 `Input.dispatchMouseEvent`), `type(text)`(`Input.insertText`), `press(key)`(Enter/Escape/Backspace `Input.dispatchKeyEvent`), `reload()`(`Page.reload` + `Page.loadEventFired`). `close()`: ws 종료 → `taskkill /PID <pid> /T /F` → exit 대기 → user-data-dir `fs.rm`(재시도) |
| `e2e/ui.e2e.js` | 신규. `node:test` 시나리오. `before`: `createServer({ dataFile: 임시 })`를 포트 0으로 listen하고 Chrome을 띄워 `/`로 이동. `after`: Chrome·서버 종료. 날짜는 `public/overdue.js`의 `localToday()`로 어제·오늘+6일을 계산(상대 날짜) |

## 작업 순서
1. 이 계획을 `plans/todo-e2e.md`로 커밋 (`plan: todo-e2e`)
2. `e2e/cdp.js` + `e2e/ui.e2e.js` + `package.json` 작성 → `npm run e2e` 통과, `npm test`·`npm run check` 통과 확인 후 커밋
3. Chrome 없음(`CHROME_PATH=C:/nope`) → exit 1과 안내 메시지 확인
4. 실행 후 `todo-e2e-` user-data-dir을 가진 chrome.exe가 남지 않았는지 확인
5. `reviewer` 리뷰 → Important 해결 → `verifier` 검증 → 결과 그대로 보고

## 리스크
- 날짜 입력(`<input type=date>`)은 키보드 입력 형식이 로케일마다 달라서, 값 설정과 해제는 JS로 `value`를 바꾸고 `change` 이벤트를 발생시킨다(수동 확인 때와 같은 방식). 나머지(클릭·더블클릭·타이핑·Enter·Esc·체크박스·삭제)는 CDP 실제 입력 이벤트로 한다.
- Windows에서 Chrome은 자식 프로세스를 여러 개 만든다 → `taskkill /T`로 트리째 종료하고, user-data-dir 삭제는 잠금 해제 대기를 위해 재시도한다.
- 비동기 렌더링 타이밍 → 고정 sleep 대신 `waitFor` 폴링(5초 제한)을 쓴다.
  - (리뷰 반영) 값이 즉시 바뀌는 조작(날짜 설정)은 행을 표시해 두고 재렌더로 요소가 교체될 때까지 기다린 뒤 API를 확인한다. CDP `send`/`once`에도 10초 제한을 두고, 연결이 끊기면 대기 중인 이벤트를 reject한다.
  - (리뷰 반영) Chrome 기동: spawn `error`도 처리(pid 없으면 kill 생략), DevTools 주소는 줄 끝까지 받은 뒤 사용, page 타깃은 최대 5초 폴링 후 없으면 `PUT /json/new`. `after`의 정리 단계는 서로 독립적으로 실행한다.
- `npm run check`(`.claude/hooks/check-syntax-all.js`)는 `src/ public/ test/`만 검사해서 `e2e/`는 검사하지 않는다. hook 파일은 수정 금지라 그대로 두고, `npm run e2e` 실행 시 파싱되는 것으로 대신한다. 검사 대상에 넣으려면 사람이 hook을 바꿔야 한다.
- `npm test`가 e2e를 잡지 않는지 → 검증 단계에서 `npm test`의 테스트 수가 19 그대로인지 확인한다.

## 증명 (어떤 테스트가 어떤 요구사항을 확인하는가)
모든 단계는 화면(DOM·계산된 스타일)과 `GET /api/todos`를 함께 확인한다.

| 요구사항 | 테스트 (`e2e/ui.e2e.js`) |
|---|---|
| R11 추가 | 제목 입력 → Enter로 마감일 없는 항목 추가. 제목 + 어제 날짜, 제목 + 오늘+6일 날짜로 추가 버튼 클릭. 3개가 생성순으로 표시 |
| R11 체크 | 체크박스 클릭 → `li.done`, `text-decoration-line: line-through`, API `done:true`. 다시 클릭 → 해제 |
| R11 수정 | 더블클릭 → 새 제목 + Enter → 화면·API 반영. 더블클릭 → 입력 + Esc → 원래 제목 유지, API 변경 없음 |
| R11 마감일 | 마감일 변경 → API 반영. 해제 → API `null`, 화면 빈 값 |
| R11 제목 검증(R3 화면) | 공백만 입력 + Enter → 추가되지 않음(화면·API 그대로). 수정에서 제목을 지우고 Enter → `#error`에 메시지, 원래 제목 유지, API 변경 없음. 입력창 `maxLength` 200 확인 |
| R11 삭제 | ✕ 클릭 → 화면·API에서 제거. 전부 삭제 시 "할 일이 없습니다" |
| R11/R13 화면 강조 | 어제 마감인 미완료 항목만 `li.overdue`, 색 `rgb(198, 40, 40)`. 미래 마감·완료 항목은 아님. 마감일을 미래로 바꾸면 강조 해제 |
| R12 필터 | 진행/완료/전체 클릭 → 해당 상태 항목만 표시, `aria-pressed` 일치 |
| R12 초기화 | "완료" 선택 → `reload()` → "전체" 선택 상태, 항목 유지 |
| Chrome 없음 | 수동 실행 1회: `CHROME_PATH=C:/nope npm run e2e` → exit 1, 안내 메시지 |

## 검증 (완료 조건)
- `npm run e2e` exit 0, 그리고 실행 후 `todo-e2e-` 프로세스·임시 폴더가 남지 않음
- `npm test` exit 0 (테스트 수 19 그대로), `npm run check` exit 0
- `data/todos.json` 변경 없음
- verifier 에이전트 보고를 그대로 전달
