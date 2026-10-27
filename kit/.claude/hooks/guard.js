// PreToolUse: 보호 경로 편집 차단 + fix 브랜치에서 커밋된 테스트 편집 차단
import { readInput, rel, git, block, config } from './lib.js';

const PROTECTED = [/^\.claude\/hooks\//, /^\.claude\/settings(\.local)?\.json$/, /^\.claude\/harness\.json$/, /^\.githooks\//];
const IS_TEST = /(^|\/)test\/|\.test\.js$/;
const PROTECTED_SH = /\.claude[\/\\](hooks|settings|harness\.json)|\.githooks/;
const WRITE_CMD = /(\brm\b|\bmv\b|sed\s+-i|\btee\b|Set-Content|Out-File|Remove-Item)/;

// 보호 경로를 바꾸는 명령인가. 명령을 단계(; && || | 줄바꿈)로 나눠, 같은 단계에서
// 리다이렉트 대상이 보호 경로이거나, 쓰기 명령이 보호 경로를 다루거나, cp의 대상이 보호 경로일 때만 참.
// 보호 파일 읽기(cat, grep, sed -n)와 다른 곳으로의 리다이렉트(2>/dev/null, 2>&1)는 통과.
function writesProtected(cmd) {
  return cmd.split(/&&|\|\||[;|\n]/).some((seg) => {
    if (!PROTECTED_SH.test(seg)) return false;
    for (const m of seg.matchAll(/>>?\s*["']?([^\s"'&]+)/g)) if (PROTECTED_SH.test(m[1])) return true;
    if (WRITE_CMD.test(seg)) return true;
    const words = seg.trim().split(/\s+/);
    return /\bcp\b/.test(seg) && PROTECTED_SH.test(words[words.length - 1]);
  });
}

const input = await readInput();
const { tool_name: tool, tool_input: ti = {} } = input;

if (tool === 'Bash' || tool === 'PowerShell') {
  const cmd = ti.command || '';
  if (/--no-verify/.test(cmd)) block('차단: --no-verify 금지. pre-commit 실패는 코드를 고쳐서 해결하세요.');
  if (writesProtected(cmd)) {
    block('차단: 가드레일 파일(.claude/hooks, settings, harness.json, .githooks)은 셸로도 수정할 수 없습니다. 변경이 필요하면 사람에게 요청하세요.');
  }
  process.exit(0);
}

const file = ti.file_path || ti.notebook_path;
if (!file) process.exit(0);
const p = rel(file);

if (PROTECTED.some((re) => re.test(p))) {
  block(`차단: ${p} 는 보호 경로입니다. 가드레일 변경은 사람이 합니다.`);
}

if (IS_TEST.test(p)) {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '';
  if (branch.startsWith('fix/')) {
    const base = config().baseBranch || 'main';
    const ahead = Number(git('rev-list', '--count', `${base}..HEAD`) || 0);
    const committed = git('cat-file', '-e', `HEAD:${p}`) !== null;
    if (ahead > 0 && committed) {
      block(`차단: ${branch} 에서 실패 테스트가 이미 커밋되었습니다. ${p} 를 수정하지 말고 구현 코드를 고치세요. 테스트가 틀렸다면 사람에게 알리세요.`);
    }
  }
}
process.exit(0);
