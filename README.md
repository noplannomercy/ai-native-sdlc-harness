# AI-native SDLC Harness v1.0

Claude Code가 **기존 Node.js 프로젝트**에서 일할 때 정해진 순서(intent → spec → plan → 구현 → 검증)를 따르게 하는 하네스입니다. 프로젝트에 설치하는 파일 묶음(`kit/`)과 설치 스크립트로 되어 있습니다.

- **누구를 위한 것인가:** AI 코딩 도구에 익숙하지 않은 개발자가 레거시 유지보수·기능 추가를 할 때. AI가 요구사항을 마음대로 정하지 않고 사람에게 묻고, 테스트를 고쳐서 통과시키지 못하게 합니다.
- **지원 범위 (v1.0):** Claude Code + Windows + Node.js 프로젝트(git 저장소). Java·Python 등 다른 스택과 다른 OS는 검증하지 않았습니다.

## 무엇이 들어 있나

| 구성 | 하는 일 |
|---|---|
| 산출물 체인 | `intent/` `specs/` `plans/`에 단계별 문서를 남기고, plan 승인 후에만 코드를 고친다 |
| 스킬 6개 | `intent`·`spec`(체인 작성) · `grilling`(결정 사항 심문) · `change-impact`(영향 분석) · `diagnosing-bugs`(버그 원인) · `click-path-audit`(화면·상태 흐름) |
| 에이전트 3개 | `spec-reviewer`(spec을 작성 대화와 분리해 사례로 검토) · `reviewer`(diff 리뷰) · `verifier`(완료 전 검증) |
| Claude Code 훅 | 가드레일 파일 편집 차단 · `fix/` 브랜치에서 커밋된 테스트 편집 차단 · 편집한 JS 문법 검사 |
| git pre-commit | 전체 JS 문법 검사 + 테스트 통과 전 커밋 차단 |
| 설정 `.claude/harness.json` | 프로젝트별 테스트 명령·기동 확인 주소. 비어 있으면 검증을 PASS로 보고하지 않는다 |

## 필요한 것

- Windows 10/11, PowerShell 5.1 이상
- [Claude Code](https://docs.claude.com/en/docs/claude-code) 2.1 이상 (검증: 2.1.310)
- Git for Windows (검증: 2.53) — pre-commit을 Git의 `sh`로 실행합니다
- Node.js 20 이상 (검증: 24.14)

## 설치

```powershell
git clone https://github.com/noplannomercy/ai-native-sdlc-harness.git C:\tools\sdlc-harness
powershell -ExecutionPolicy Bypass -File C:\tools\sdlc-harness\install.ps1 -Target C:\work\my-app
```

`-Target`은 설치할 프로젝트의 **git 저장소 최상위 폴더**입니다. 설치 스크립트가 하는 일은 네 가지뿐입니다.

1. `kit/`의 파일을 프로젝트에 복사합니다 (`.claude/`, `.githooks/`, `templates/`, `CLAUDE.md`, `REVIEW.md`).
2. `.claude/harness.json`을 만듭니다. `package.json`에 `test`·`start` 스크립트가 있으면 `npm test`·`npm start`로 미리 채웁니다.
3. `intent/` `specs/` `plans/` 폴더가 없으면 만듭니다.
4. `git config core.hooksPath .githooks`로 pre-commit을 켭니다.

커밋은 하지 않습니다. `package.json`과 기존 파일은 고치지 않습니다.

### 설치 후 설정 (사람이 할 일)

설치 스크립트가 마지막에 남은 일을 출력합니다.

1. **`.claude/harness.json` 채우기**
   ```json
   {
     "baseBranch": "main",
     "testCommand": "npm test",
     "smoke": { "start": "npm start", "url": "http://localhost:3000/" }
   }
   ```
   | 키 | 뜻 | 비어 있으면 |
   |---|---|---|
   | `baseBranch` | 작업 브랜치를 비교할 기준 브랜치 | `main`으로 간주 |
   | `testCommand` | 테스트 명령 | **커밋이 막힙니다** |
   | `smoke.start` / `smoke.url` | 앱을 띄우는 명령과 응답을 확인할 주소 (HTTP 2xx·3xx면 통과) | verifier가 **"검증 불가"**로 보고 |
   | `smoke: false` | 서버가 없는 프로젝트(라이브러리·CLI)라고 사람이 선언 | — |

   이 파일은 AI가 고칠 수 없습니다(훅이 차단). 검증 기준은 사람이 정합니다.
2. **`CLAUDE.md`의 "(설치 후 채움)" 칸 채우기** — 개요, 스택, 코드 구조.
3. **커밋** — `git add -A; git commit -m "harness: AI-native SDLC 하네스 설치"`. 이때 pre-commit이 처음 돌아 테스트가 실행됩니다.
4. **프로젝트 폴더에서 `claude` 실행** — 처음 뜨는 "이 폴더를 신뢰하는가" 확인을 승인해야 프로젝트 훅·스킬이 켜집니다.

처음이라면 `example/todo-app`을 다른 폴더에 복사해 연습해 보세요 → [USER_GUIDE.md](USER_GUIDE.md) "연습".

### 설치가 중단될 때

설치 스크립트는 충돌을 하나라도 찾으면 **아무것도 바꾸지 않고** 중단합니다. 해결한 뒤 다시 실행하면 됩니다.

| 메시지 | 해결 |
|---|---|
| `CLAUDE.md — 하네스가 만든 파일이 아닙니다` | 기존 CLAUDE.md를 다른 이름(예: `CLAUDE.old.md`)으로 옮긴 뒤 설치하고, 필요한 내용을 새 CLAUDE.md의 "제약 사항"·"구조"에 옮겨 적습니다. `REVIEW.md`도 같습니다 |
| `.claude\settings.json — 이미 있고 내용이 다릅니다` | 기존 설정을 옮겨 두고 설치한 뒤, 필요한 항목을 `.claude/settings.local.json`(개인용)에 다시 넣습니다 |
| `core.hooksPath=... 가 이미 설정돼 있습니다` (husky 등) | 기존 훅 도구와 함께 쓰려면 사람이 훅을 합쳐야 합니다. v1은 자동으로 합치지 않습니다 |
| `기존 git 훅이 있습니다` | `.git/hooks/`의 훅을 `.githooks/`로 옮겨 합치거나 지운 뒤 다시 실행합니다 |
| `package.json 없음` | v1은 Node.js 프로젝트 전용입니다 |
| `설치 실패 … 부분 설치 상태입니다` | 출력된 원인(권한·같은 이름의 파일 등)을 해결하고 다시 실행하면 남은 것만 설치합니다 |

다시 실행해도 안전합니다. 이미 같은 파일은 건너뛰고, 사람이 고친 `CLAUDE.md`·`REVIEW.md`·`harness.json`은 유지합니다.

## 문서

| 문서 | 대상 |
|---|---|
| [USER_GUIDE.md](USER_GUIDE.md) | 개발자 — 실제 작업을 하네스로 진행하는 법, AI 질문에 답하는 법, 승인과 검증 |
| [MAINTENANCE.md](MAINTENANCE.md) | 관리자 — 구성 요소, 스킬·규칙 추가, 업데이트, 문제 해결 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 외부 스킬 4개의 출처와 라이선스 (MIT) |
| [LICENSE](LICENSE) | 이 하네스의 라이선스 (MIT) |

## 저장소 구조

| 경로 | 역할 |
|---|---|
| `install.ps1` | 설치 스크립트 |
| `kit/` | 프로젝트에 복사되는 파일 (구조 그대로) |
| `example/todo-app/` | 연습용 예제 앱 (하네스 미설치 상태 + 예시 산출물) |
| `tools/clean-session.cmd` | 전역 Claude 설정 없이 하네스만으로 실행해 보는 관리자용 도구 |
