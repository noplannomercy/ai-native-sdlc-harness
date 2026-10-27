# 관리자 문서

하네스를 고치거나 업데이트하거나 문제를 해결하는 사람을 위한 문서입니다. 사용법은 [USER_GUIDE.md](USER_GUIDE.md)를 보세요.

## 구성 요소와 강제 수준

강제 수준은 셋입니다. **모델 의존**(AI가 지시를 따라야 동작), **Claude Code 훅**(Claude Code 안에서는 AI가 우회할 수 없음), **git 훅**(Claude 밖에서도 커밋 시 동작). 규칙을 추가하거나 고칠 때는 어느 수준에 둘지부터 정합니다.

| 파일 (설치 후 경로) | 역할 | 강제 수준 |
|---|---|---|
| `CLAUDE.md` | 체인·제약·준수 사항·완료 조건. 세션마다 자동으로 읽힌다 | 모델 의존 |
| `.claude/skills/intent`, `spec` | 체인 산출물 작성 절차. `spec`이 `spec-reviewer`를 부른다 | 모델 의존 |
| `.claude/skills/grilling`, `diagnosing-bugs` | 외부 원본(Matt Pocock, MIT) — 수정 금지 | 모델 의존 |
| `.claude/skills/change-impact`, `click-path-audit` | 외부 원본(ECC, MIT) — 수정 금지 | 모델 의존 |
| `.claude/agents/spec-reviewer.md` | spec을 작성 대화와 분리해 실제 값·경계값 사례로 검토 | 모델 의존 |
| `.claude/agents/reviewer.md` + `REVIEW.md` | diff 리뷰 (기준은 REVIEW.md) | 모델 의존 |
| `.claude/agents/verifier.md` | `harness.json`의 명령으로 검증. 미설정이면 "검증 불가" | 모델 의존 |
| `.claude/settings.json` | 권한(allow·deny: push·npm install 차단)과 훅 연결 | Claude Code |
| `.claude/hooks/guard.js` | PreToolUse: 보호 경로 편집 차단, `fix/` 브랜치에서 커밋된 테스트 편집 차단, `--no-verify` 차단 | Claude Code |
| `.claude/hooks/check-syntax.js` | PostToolUse: 편집한 JS 파일 문법 검사 | Claude Code |
| `.claude/hooks/check-syntax-all.js` | git이 아는 모든 `.js/.mjs/.cjs` 문법 검사 (pre-commit·verifier가 호출) | — |
| `.claude/hooks/lib.js` | 훅 공통 함수, `harness.json` 읽기 | — |
| `.claude/harness.json` | 프로젝트별 `baseBranch`·`testCommand`·`smoke`. 설치 스크립트가 만든다 (kit에 없음) | 보호 경로 |
| `.githooks/pre-commit` | `fix/` 브랜치에서 커밋된 테스트 수정·삭제 차단(셸 경로 포함) + 문법 검사 + `testCommand`. 비어 있으면 커밋 차단 | git 훅 |
| `.githooks/.gitattributes` | pre-commit을 LF로 고정 (CRLF면 `sh`가 실패) | — |
| `templates/` | intent·spec·plan 양식 | — |

보호 경로(`guard.js`의 `PROTECTED`): `.claude/hooks/`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/harness.json`, `.githooks/`. 이 파일들은 AI가 못 고치므로 **사람이 편집기로 직접** 고칩니다.

## 하네스 진화 원칙

- 규칙은 **같은 실패가 2회 이상 관찰될 때만** 추가합니다. 1회 관찰로 설계하지 않습니다.
- 반드시 지켜야 할 규칙은 훅으로, 판단이 필요한 절차는 스킬로 둡니다.
- `CLAUDE.md`는 한 페이지를 넘기지 않습니다.
- 외부 스킬 4개는 원본 그대로 씁니다. 행동을 바꾸고 싶으면 스킬을 고치지 말고, 우리 쪽 파일(spec 스킬·CLAUDE.md·에이전트)에서 호출 시점과 앞뒤 단계를 조정합니다.

### 지금 구성이 된 이유 (하네스 시험 기록 요약)

같은 레거시 휴가 앱의 같은 민원(연도에 걸친 휴가가 올해 잔여에서 전부 차감)을 같은 사람 답으로 세 번 처리해 비교했습니다.

| 시험 | 하네스 | 결과 |
|---|---|---|
| 1차 | 체인 + 훅 + reviewer·verifier | 원인·TDD는 통과. 그러나 spec 구멍(내년 휴가 무제한 신청)이 reviewer·verifier·사람을 모두 통과해 머지됨. 날짜 문자열 우회·테스트 시한폭탄·문서 미갱신도 남음 |
| 2차 | + 스킬 4개 + `/code-review` | 결함 3개 해소, spec 구멍은 코드에 남았지만 완료 보고에서 사람에게 결정 요청. `grilling` 추천안이 구멍 자체였음 |
| 3차 | + `spec-reviewer` + 커밋 규칙 수정 | `spec-reviewer`가 spec 단계에서 구멍을 실제 값 사례로 찾아 사람에게 올림 → 코드·테스트로 차단. 1차의 남은 결함 4개 모두 해소 |

- `spec-reviewer`는 1차·2차에서 같은 실패(spec 구멍이 검토를 통과)가 두 번 나와 추가했습니다.
- 배포 시험(새 앱, 깨끗한 설치)에서는 spec-reviewer가 수용 기준의 계산 오류(잠기면 되돌릴 수 없는 테스트)와 음수 쿠폰 경로를 잡았습니다. AI가 혼자 "승인 간주"로 체크한 결정도 다시 사람에게 올렸습니다. 같은 시험에서 셸로 기존 테스트를 고치는 경로가 훅을 통과해 pre-commit 잠금을 넣었습니다(문서에 있던 규칙의 구현 누락).
- "테스트와 수정을 한 커밋에" 규칙은 "실패 테스트 먼저 커밋"과 pre-commit이 두 번 충돌해서 바꿨습니다.

## 자주 하는 관리 작업

### 프로젝트별 검증 명령 바꾸기
`.claude/harness.json`을 편집기로 고칩니다. 테스트 명령은 Git의 `sh`로 실행되므로 `npm test`, `npm run test:unit`, `node --test test/` 같은 형태로 씁니다.

### 팀원이 프로젝트를 새로 clone했을 때
`core.hooksPath`는 저장소에 저장되지 않는 로컬 git 설정입니다. 새로 clone하면 **pre-commit이 꺼진 상태**입니다. clone한 사람이 아래 중 하나를 실행해야 합니다.
```powershell
git config core.hooksPath .githooks
# 또는 설치 스크립트를 다시 실행 (파일은 모두 '같음'으로 건너뛰고 훅 경로만 켭니다)
powershell -ExecutionPolicy Bypass -File C:\tools\sdlc-harness\install.ps1 -Target .
```

### 스킬·에이전트 추가
1. 같은 실패가 두 번 관찰됐는지 먼저 확인합니다 (진화 원칙).
2. `kit/.claude/skills/<이름>/SKILL.md` 또는 `kit/.claude/agents/<이름>.md`를 추가합니다. 외부 스킬이면 원본을 그대로 넣고 `THIRD_PARTY_NOTICES.md`에 저장소·경로·커밋·라이선스를 적습니다.
3. 호출 시점을 `kit/CLAUDE.md` 준수 사항 6 또는 `spec` 스킬 단계에 적습니다. 적지 않으면 AI가 부르지 않습니다.
4. `kit/CLAUDE.md` "구조" 표를 갱신합니다.
5. 아래 "배포 전 검증"을 합니다.

### 외부 스킬 업데이트
원본 저장소의 새 커밋에서 해당 폴더를 통째로 복사해 바꾸고, `THIRD_PARTY_NOTICES.md`의 커밋을 갱신합니다. 내용이 크게 바뀌었으면 연습 앱에서 한 번 돌려 봅니다.

### 설치된 프로젝트를 새 버전으로 올리기
v1에는 자동 업그레이드가 없습니다. 설치 스크립트는 내용이 다른 파일을 덮어쓰지 않으므로 다시 실행하면 충돌로 중단됩니다. 절차:
1. 새 `kit/`와 프로젝트 파일을 비교합니다 (`git diff --no-index C:\tools\sdlc-harness\kit\.claude .claude`).
2. 하네스 소유 파일(`.claude/hooks`·`agents`·`skills`·`settings.json`, `.githooks`, `templates`)을 사람이 새 버전으로 바꿉니다. `CLAUDE.md`·`REVIEW.md`·`harness.json`은 프로젝트 내용이 들어 있으므로 바뀐 줄만 옮깁니다.
3. 설치 스크립트를 다시 실행해 "충돌 없음"을 확인하고, 커밋합니다.

### 망가진 파일 복구
하네스 소유 파일이 지워졌으면 설치 스크립트를 다시 실행합니다(없는 파일만 다시 만듭니다). 내용이 바뀌었으면 그 파일을 지우고 다시 실행합니다.

### 제거
`.claude/`(개인 `settings.local.json`이 있으면 남김), `.githooks/`, `templates/`, `CLAUDE.md`, `REVIEW.md`를 지우고 `git config --unset core.hooksPath`. 산출물(`intent/` `specs/` `plans/`)은 작업 기록이므로 남겨 둡니다.

## 문제 해결

| 증상 | 확인 |
|---|---|
| 훅이 전혀 동작하지 않는다 (보호 파일이 편집된다) | 폴더 신뢰 확인을 승인했나. `claude` 안에서 `/hooks`로 PreToolUse·PostToolUse가 보이나. `node`가 PATH에 있나 |
| 스킬·에이전트가 안 보인다 | `claude`를 **프로젝트 최상위 폴더에서** 실행했나. `/agents`에 verifier·reviewer·spec-reviewer가 있나 |
| pre-commit이 안 돈다 | `git config core.hooksPath` → `.githooks`인가. clone 직후면 위 "팀원이 clone했을 때" |
| pre-commit이 `\r` 관련 오류로 실패 | `.githooks/pre-commit`이 CRLF가 됨. `.githooks/.gitattributes`가 있는지 보고 `git add --renormalize .githooks` |
| `fix/` 브랜치인데 테스트 편집이 막히지 않는다 | 그 브랜치에 아직 커밋이 없으면 의도대로 허용됩니다. `harness.json`의 `baseBranch`가 실제 기준 브랜치와 같은지 확인 |
| verifier가 계속 "검증 불가" | `harness.json`에 빈 값이 있음. 서버가 없는 프로젝트면 `"smoke": false` |
| Claude 실행 중 창을 만지면 창이 꺼진다 (Windows 10 1809·Server 2019 계열) | 오래된 기본 콘솔(conhost) 문제. VS Code 터미널이나 Windows Terminal에서 실행. 꺼졌으면 같은 폴더에서 `claude --continue` |
| 전역 Claude 설정(플러그인·전역 CLAUDE.md) 때문에 동작이 다르다 | `tools/clean-session.cmd`를 프로젝트에 복사해 실행하면 `%USERPROFILE%\.claude-clean`을 설정 폴더로 써서 하네스만으로 돌려 볼 수 있습니다 (처음 한 번 로그인 필요) |

## 알려진 한계 (v1.0.1)

- **모델 의존 단계는 건너뛸 수 있습니다.** 스킬 호출, `spec-reviewer`, `verifier`는 AI가 CLAUDE.md를 따를 때만 동작합니다. 완료 보고 전에 verifier를 강제하는 훅은 없습니다.
- **열린 결정이 남은 채 머지되는 것은 막지 않습니다.** 완료 보고의 "확인이 필요한 사항"은 사람이 읽어야 합니다.
- **`grilling`의 추천안은 위험할 수 있습니다.** 시험에서 두 번 연속 구멍이 있는 추천안을 냈습니다. `spec-reviewer`가 뒤에서 잡지만, 사람이 일괄 수락하지 않는 것이 먼저입니다 (USER_GUIDE 2단계).
- **셸 명령을 통한 보호 파일 수정 차단은 패턴 검사입니다.** `node -e`로 파일을 쓰는 식의 우회는 막지 못합니다(Edit·Write 도구 경로는 확실히 막습니다). 반대로 오탐도 있습니다. heredoc 본문에 `.claude/hooks` 경로나 `no-verify` 글자만 있어도 막힙니다. 이때 AI는 Write 도구로 돌아가며, 배포 시험에서 한 세션에 6번 나왔습니다. 커밋된 테스트 잠금은 셸로 우회해도 pre-commit이 막습니다.
- **`fix/` 브랜치의 첫 커밋 전에는 기존 테스트를 고칠 수 있습니다** (훅·pre-commit 모두 "브랜치에 커밋이 하나 이상"일 때부터 잠금). 보통은 intent·spec·plan 커밋이 먼저 들어가므로 구현 시점에는 잠겨 있습니다.
- **리뷰 단계가 모든 구멍을 잡지는 않습니다.** 배포 시험(쇼핑몰 배송비 민원)에서 `qty: 1.5` 같은 소수 수량은 spec-reviewer·`/code-review`·reviewer·verifier 모두 놓쳤습니다.
- **pre-commit은 사람이 Claude 밖에서 `--no-verify`로 건너뛸 수 있습니다.** 서버 쪽 강제(CI·브랜치 보호)는 범위 밖입니다.
- **설치와 지원 보장은 다릅니다.** v1.0.1부터 설치는 프로젝트 언어를 따지지 않습니다. 하지만 하네스 전체 흐름을 검증한 것은 Node.js·Windows뿐입니다. Java 프로젝트(litemall)는 설치·재실행·충돌 중단까지만 확인했습니다. 다른 스택에서는 `harness.json`의 `testCommand` 등을 사람이 채워야 하고, settings 허용 목록에 `npm`만 있어서 `mvn` 같은 명령은 매번 승인을 묻습니다.
- **문법 검사는 JS만 봅니다.** TypeScript는 검사하지 않고, Java 등은 검사 대상이 아닙니다. 다른 언어의 컴파일 오류는 `testCommand`가 잡아야 합니다.
- **저장소에 Node로 읽을 수 없는 JS가 있으면 커밋이 막힙니다.** pre-commit은 git이 아는 모든 `.js`를 `node --check`로 검사하고, 제외 설정이 없습니다. 예를 들어 litemall은 위챗 미니앱용 외부 라이브러리 `renard-wx/lib/wxParse/showdown.js` 때문에 설치 직후 첫 커밋부터 실패합니다. Node 프로젝트에 외부 JS를 넣어 둔 경우에도 같습니다.

## 배포 전 검증 (kit을 고친 뒤)

1. `example/todo-app`을 새 폴더에 복사 → `git init` → 커밋 → `install.ps1` → 출력 확인.
2. 같은 폴더에 다시 실행 → "새로 만듦 0".
2-1. `package.json`이 없는 저장소(예: Java 프로젝트)에서 실행 → 설치되고, 기존 파일 변경 0건, `testCommand`는 빈 값.
3. `CLAUDE.md`가 이미 있는 저장소, `core.hooksPath=.husky`인 저장소에서 실행 → 충돌로 중단되고 파일이 그대로인지.
4. `testCommand`를 비우고 커밋 → 차단. 실패 테스트를 넣고 커밋 → 차단.
5. 설치한 폴더에서 `claude -p "<요청>" --output-format stream-json --verbose`를 실행해 init 이벤트의 `skills`·`agents`에 6개·3개가 있는지, `.claude/hooks/guard.js` 편집 요청이 훅에 막히는지.
6. 짧은 과제 하나를 intent부터 verifier까지 돌립니다.
