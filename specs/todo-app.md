---
slug: todo-app
intent: intent/todo-app.md
status: accepted   # draft | accepted
---

# 개인용 할 일 관리 웹앱 — Spec

## 요구사항
| ID | 요구사항 | 수용 기준 (테스트로 확인 가능하게) |
|---|---|---|
| R1 | 할 일 목록 조회 | `GET /api/todos` → 200, `Content-Type: application/json`, 본문은 생성순(오래된 것 먼저) Todo 배열. 저장된 항목이 없으면 `[]` |
| R2 | 할 일 추가 | `POST /api/todos` `{title}` → 201, 생성된 Todo 반환 (`id` 부여, `done:false`). 이후 `GET`에 포함됨 |
| R3 | 제목 검증 | 앞뒤 공백 제거 후 빈 제목이거나 200자 초과면 `POST`/`PATCH` → 400, 저장되지 않음 |
| R4 | 완료 체크/해제 | `PATCH /api/todos/:id` `{done:true\|false}` → 200, 변경된 Todo 반환 |
| R5 | 제목 수정 | `PATCH /api/todos/:id` `{title}` → 200, `title` 변경됨 |
| R6 | 마감일 지정/해제 | `POST`/`PATCH`에 `dueDate:"YYYY-MM-DD"` 또는 `null` 허용. 형식이 틀리면 400 |
| R7 | 삭제 | `DELETE /api/todos/:id` → 204. 이후 `GET`에 없음 |
| R8 | 없는 항목 | 존재하지 않는 `id`로 `PATCH`/`DELETE` → 404 |
| R9 | 영속성 | 저장소를 같은 파일 경로로 다시 열면(서버 재시작 시뮬레이션) 이전 항목이 그대로 조회됨 |
| R10 | 정적 프론트 제공 | `GET /` → 200, `text/html`. `public/` 밖 경로 접근(`/../`)은 404 |
| R11 | 화면: 목록·추가·체크·삭제·수정·마감일 | `public/` UI에서 R2~R7 동작이 가능하고, 완료 항목은 취소선 등으로 구분됨 (수동 확인) |
| R12 | 화면: 필터 | 전체/진행/완료 선택 시 해당 상태 항목만 표시 (클라이언트 측 필터, 새로고침 시 '전체'로 초기화, 수동 확인) |
| R13 | 화면: 마감 지남 강조 | 미완료이고 마감일이 오늘(로컬 날짜) 이전인 항목은 빨간색으로 표시. 판정 함수는 `public/` 모듈로 분리해 단위 테스트 |

## 설계
### API / 데이터 모델
```
Todo = { id: string, title: string, done: boolean, dueDate: string|null, createdAt: string(ISO) }
```
- `id`: `crypto.randomUUID()`
- 엔드포인트: `GET/POST /api/todos`, `PATCH/DELETE /api/todos/:id`
- 에러 응답: `{ error: string }` + 4xx
- 저장: 기본 경로 `data/todos.json` (`.gitignore`에 `data/` 추가). `src/store.js` — 파일 경로를 주입받아 JSON 배열을 읽고/쓴다. 쓰기는 임시 파일에 쓴 뒤 rename(원자적 교체). 파일이 없으면 빈 배열로 시작.
- 서버: `src/server.js` — `createServer({ dataFile })`를 export 하여 테스트에서 임시 경로·임의 포트로 띄울 수 있게 한다. 직접 실행 시 포트 3000(`PORT` 환경변수로 변경 가능).
- 테스트: `test/store.test.js`, `test/api.test.js` (`node:test`, 내장 `fetch`)

### 화면 동작
- `public/index.html` + `public/app.js` (프레임워크 없음)
- 상단 입력창(제목 + 마감일 date input) → 추가
- 각 항목: 체크박스, 제목(더블클릭 시 편집, Enter 저장/Esc 취소), 마감일, 삭제 버튼
- 필터 버튼 3개: 전체/진행/완료 (상태 저장 안 함)
- 마감 지남 판정: `public/overdue.js`의 `isOverdue(todo, today)` — `test/overdue.test.js`에서 검증
- 모든 변경은 API 호출 후 응답으로 목록 갱신

## 범위 밖
- 로그인·다중 사용자
- 우선순위, 태그, 검색, 드래그 정렬
- 오프라인 지원, 실시간 동기화

## 우려 사항 (사람이 결정해야 함)
- [x] **마감 지난 항목 강조** → 강조함 (R13)
- [x] **정렬 기준** → 생성순 (R1)
- [x] **제목 길이 제한** → 최대 200자 (R3)
- [x] **데이터 파일 위치·git 추적** → `data/todos.json`, `.gitignore`에 `data/`
- [x] **필터 상태 유지** → 유지 안 함 (R12)
