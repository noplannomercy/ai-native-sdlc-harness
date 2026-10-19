// npm run check: src/ public/ test/ 의 모든 .js 문법 검사
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const files = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.m?js$/.test(e.name)) files.push(p);
  }
};
['src', 'public', 'test'].forEach(walk);

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
