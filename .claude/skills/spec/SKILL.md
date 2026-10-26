---
name: spec
description: 승인된 intent/<slug>.md를 specs/<slug>.md(요구사항+설계)로 만들 때 사용. "스펙 써줘", "설계하자", "intent 승인했어", 또는 plan을 세우려는데 대응하는 spec이 없을 때.
---

# Spec 작성

입력: `status: accepted`인 `intent/<slug>.md`. 승인되지 않았으면 멈추고 알린다.

1. intent와 현재 코드(`src/`, `public/`, `test/`)를 읽는다.
2. `templates/spec.md` 양식으로 작성한다.
   - 요구사항마다 **테스트로 확인 가능한** 수용 기준을 붙인다.
   - intent의 열린 질문, 기존 코드와의 충돌, CLAUDE.md 제약과의 충돌은 "우려 사항"에 체크박스로 남긴다. 스스로 결정하지 않는다.
3. `spec-reviewer` 에이전트로 독립 검토한다. 발견 사항은 "우려 사항"에 체크박스로 추가한다. 이미 사용자가 결정한 항목에 대한 발견도 빼지 않는다.
4. 사용자에게 우려 사항부터 보여주고 결정을 받는다. spec-reviewer 발견 사항은 사례 그대로 보여준다.
5. 우려 사항이 모두 해결되면 `status: accepted`로 바꾸고 `spec: <slug>`로 커밋한다.

다음 단계: plan mode에서 `templates/plan.md` 양식으로 `plans/<slug>.md` 작성.
