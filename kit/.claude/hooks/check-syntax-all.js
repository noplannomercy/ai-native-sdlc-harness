// 커밋·완료 전 문법 검사: 이번 작업에서 바뀐 .js/.mjs/.cjs
// (기준 브랜치 이후 커밋 + 스테이징 + 작업 트리 + 새 파일, .gitignore 제외)
// 저장소 전체를 보지 않는다. 손대지 않은 JS는 이 작업의 결과가 아니고, Node가 실행하지 않는 코드(브라우저·미니앱 라이브러리)일 수 있다.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { git, config } from './lib.js';

const base = config().baseBranch || 'main';
const listed = [
  git('diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`),
  git('diff', '--name-only', '--diff-filter=ACMR', '--cached'),
  git('diff', '--name-only', '--diff-filter=ACMR'),
  git('ls-files', '-o', '--exclude-standard'),
].join('\n');

const files = [...new Set(listed.split('\n'))]
  .filter((f) => /\.[cm]?js$/.test(f) && !/(^|\/)node_modules\//.test(f) && existsSync(f));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  } catch (e) {
    failed++;
    console.error(`FAIL ${f}\n${e.stderr}`);
  }
}
console.log(`check: ${files.length - failed}/${files.length} ok (changed JS)`);
process.exit(failed ? 1 : 0);
