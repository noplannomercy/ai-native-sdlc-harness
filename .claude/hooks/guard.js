// PreToolUse: 보호 경로 편집 차단 + fix 브랜치에서 커밋된 테스트 편집 차단
import { readInput, rel, git, block } from './lib.js';

const PROTECTED = [/^\.claude\/hooks\//, /^\.claude\/settings(\.local)?\.json$/, /^\.githooks\//];
const IS_TEST = /(^|\/)test\/|\.test\.js$/;
const WRITE_OPS = /(>|\brm\b|\bmv\b|\bcp\b|sed\s+-i|\btee\b|Set-Content|Out-File|Remove-Item)/;

const input = await readInput();
const { tool_name: tool, tool_input: ti = {} } = input;

if (tool === 'Bash' || tool === 'PowerShell') {
  const cmd = ti.command || '';
  if (/--no-verify/.test(cmd)) block('차단: --no-verify 금지. pre-commit 실패는 코드를 고쳐서 해결하세요.');
  if (/\.claude[\/\\](hooks|settings)|\.githooks/.test(cmd) && WRITE_OPS.test(cmd)) {
    block('차단: 가드레일 파일(.claude/hooks, settings, .githooks)은 셸로도 수정할 수 없습니다. 변경이 필요하면 사람에게 요청하세요.');
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
    const ahead = Number(git('rev-list', '--count', 'main..HEAD') || 0);
    const committed = git('cat-file', '-e', `HEAD:${p}`) !== null;
    if (ahead > 0 && committed) {
      block(`차단: ${branch} 에서 실패 테스트가 이미 커밋되었습니다. ${p} 를 수정하지 말고 구현 코드를 고치세요. 테스트가 틀렸다면 사람에게 알리세요.`);
    }
  }
}
process.exit(0);
