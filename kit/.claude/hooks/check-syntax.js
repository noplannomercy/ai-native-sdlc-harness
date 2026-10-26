// PostToolUse: 편집한 .js 파일 하나만 문법 검사 (빠르고 파일 범위)
import { execFileSync } from 'node:child_process';
import { readInput, block } from './lib.js';

const { tool_input: ti = {} } = await readInput();
const file = ti.file_path;
if (!file || !/\.[cm]?js$/.test(file)) process.exit(0);

try {
  execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
} catch (e) {
  block(`문법 오류 (${file}):\n${e.stderr}`);
}
