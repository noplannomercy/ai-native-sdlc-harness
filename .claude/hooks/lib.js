import { execFileSync } from 'node:child_process';
import path from 'node:path';

export async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export const projectDir = () => process.env.CLAUDE_PROJECT_DIR || process.cwd();

// 프로젝트 기준 상대 경로 (슬래시 통일)
export function rel(file) {
  return path.relative(projectDir(), path.resolve(projectDir(), file)).split(path.sep).join('/');
}

export function git(...args) {
  try {
    return execFileSync('git', args, { cwd: projectDir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// exit 2 + stderr = 차단하고 Claude에게 이유 전달
export function block(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}
