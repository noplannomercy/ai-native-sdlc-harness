// 커밋 전 전체 문법 검사: git이 아는 모든 .js/.mjs/.cjs (추적 + 새 파일, .gitignore 제외)
import { execFileSync } from 'node:child_process';
import { git } from './lib.js';

const files = (git('ls-files', '-co', '--exclude-standard') || '')
  .split('\n')
  .filter((f) => /\.[cm]?js$/.test(f) && !/(^|\/)node_modules\//.test(f));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  } catch (e) {
    failed++;
    console.error(`FAIL ${f}\n${e.stderr}`);
  }
}
console.log(`check: ${files.length - failed}/${files.length} ok`);
process.exit(failed ? 1 : 0);
