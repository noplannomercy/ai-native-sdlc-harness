# CLAUDE.md

## 작업 시작 전
- 새 기능/버그는 `intent/` → `specs/` → `plans/` 산출물 체인을 따른다. 해당 단계 산출물이 없으면 앞 단계부터 만든다.
- 구현은 plan mode로 시작한다. 승인된 계획을 `plans/<slug>.md`로 커밋한 뒤에만 코드를 수정한다.

## 개요
Todo 웹앱 (AI-native SDLC 플레이북 하네스 검증용). 의존성 없는 Node 서버 + 정적 프론트엔드.

## 제약 사항
- `.claude/hooks/`, `.claude/settings.json`은 수정 금지 (hook이 차단). 가드레일 변경은 사람이 한다.
- 버그 수정은 `fix/<slug>` 브랜치에서: 테스트를 먼저 쓰고 수정 전 코드에서 실패(RED)하는 실행 결과를 `plans/<slug>.md`에 남긴 뒤, 테스트와 수정을 한 커밋에 넣는다. 커밋된 테스트는 수정할 수 없다 (hook이 차단). — 이유: 테스트를 고쳐서 통과시키는 것을 막기 위해. 테스트만 먼저 커밋하지 않는다 — pre-commit이 실패 테스트 커밋을 막는다(flight-01·02에서 두 번 충돌).
- npm 의존성 추가 금지. Node 내장 모듈만 사용한다. — 이유: 하네스 검증 속도와 재현성.
- `--no-verify` 커밋 금지. pre-commit의 `npm test` 실패는 코드를 고쳐서 해결한다.

## 준수 사항
1. 산출물 파일명은 같은 slug를 공유한다: `intent/<slug>.md`, `specs/<slug>.md`, `plans/<slug>.md`.
2. 계획과 구현이 달라지면 `plans/<slug>.md`를 먼저 갱신한다.
3. 완료 보고 전 `verifier` 에이전트로 검증하고, 결과를 그대로 보고한다.
4. 사용자에게 하는 모든 응답과 커밋 메시지는 한국어로 쓴다.
5. 같은 실수를 두 번 하면 이 파일 "제약 사항"에 이유와 함께 추가를 제안한다.
6. 단계별 스킬을 호출한다: spec 작성 전 `grilling`(결정 사항 심문) · spec 승인 직후와 구현 후 `change-impact`(영향 분석·diff 대조) · 민원·버그 원인 분석 `diagnosing-bugs` · 화면·상태 흐름 점검 `click-path-audit` · 커밋 전 `/code-review`.

## 스택
| 항목 | 값 |
|---|---|
| 런타임 | Node 24 (ESM) |
| 서버 | `node:http` |
| 테스트 | `node:test` + `node:assert` |
| 프론트 | `public/` 정적 HTML/JS |

## 구조
| 경로 | 역할 |
|---|---|
| `intent/` `specs/` `plans/` | 단계별 산출물 (감사 기록) |
| `templates/` | 산출물 양식 |
| `src/` | 서버 코드 |
| `public/` | 프론트엔드 |
| `test/` | `*.test.js` |
| `REVIEW.md` | 리뷰 기준 (`reviewer` 에이전트가 사용) |
| `.claude/` | skills(intent, spec, grilling, change-impact, diagnosing-bugs, click-path-audit) · agents(verifier, reviewer, spec-reviewer) · hooks |

## 하네스 진화 원칙
- 규칙은 반복 실패(2회 이상)가 관찰될 때만 추가한다. 1회 관찰로 설계하지 않는다.
- 반드시 지켜야 할 규칙은 hook으로, 판단이 필요한 절차는 skill로 둔다.
- 이 파일은 한 페이지를 넘기지 않는다.

## 완료 조건
- `npm test` → exit 0
- `npm run check` → exit 0
- `npm start` 후 `curl -s localhost:3000/api/todos` → JSON 응답
