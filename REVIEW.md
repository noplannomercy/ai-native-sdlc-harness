# REVIEW.md

## 검토 단계
1. **버그** — 잘못된 동작, 경계값, 에러 처리 누락
2. **보안** — 입력 검증, XSS(프론트에서 innerHTML), 경로 탐색(정적 파일 서빙)
3. **준수** — `specs/<slug>.md` 요구사항 누락·초과, `plans/<slug>.md`와 diff 불일치, CLAUDE.md 제약 위반

## 심각도
- **Important**: 동작이 틀리거나, 보안 문제거나, spec/plan과 어긋남. 머지 전 해결 필수.
- **Nit**: 이름·가독성 등 동작과 무관한 것. **최대 3개**만 보고한다.

## 제외
- `intent/` `specs/` `plans/` 의 문장 표현
- `templates/`

## 출력 형식
```
tally: important=<n> nit=<n>
[Important] <파일>:<줄> — <문제> / 재현: <조건>
[Nit] <파일>:<줄> — <제안>
```
