// 최소 Chrome DevTools Protocol 클라이언트 — headless Chrome을 띄워 내장 WebSocket으로 조작한다
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_SUFFIX = path.join('Google', 'Chrome', 'Application', 'chrome.exe');

// CHROME_PATH → Windows 기본 설치 경로 순서로 찾는다
export function findChrome() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH에 Chrome이 없습니다: ${process.env.CHROME_PATH}`);
  }
  const candidates = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']
    .map((v) => process.env[v])
    .filter(Boolean)
    .map((dir) => path.join(dir, CHROME_SUFFIX));
  const found = candidates.find((p) => existsSync(p));
  if (found) return found;
  throw new Error(
    `Chrome을 찾지 못했습니다. 확인한 경로:\n  ${candidates.join('\n  ')}\nCHROME_PATH 환경변수로 chrome.exe 경로를 지정하세요.`,
  );
}

function waitForDevToolsUrl(proc, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`Chrome DevTools 주소를 ${timeout}ms 안에 받지 못했습니다:\n${buf}`)), timeout);
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
      buf += chunk;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome이 시작 중 종료되었습니다 (code ${code}):\n${buf}`));
    });
  });
}

export async function launchChrome() {
  const exe = findChrome();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'todo-e2e-'));
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1024,768',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const exited = new Promise((r) => proc.once('exit', r));

  // 연결 전에 실패해도 Chrome과 임시 폴더를 남기지 않는다
  async function kill() {
    if (proc.exitCode === null && proc.signalCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      else proc.kill();
      await exited;
    }
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }

  try {
    const { port } = new URL(await waitForDevToolsUrl(proc));
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('Chrome page 타깃이 없습니다');
    const client = await connect(page.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    return createPage(client, async () => {
      client.close();
      await kill();
    });
  } catch (e) {
    await kill();
    throw e;
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p?.reject(new Error(`${msg.error.message} (${p.method})`));
        else p?.resolve(msg.result);
      } else {
        for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
    ws.addEventListener('close', () => {
      for (const p of pending.values()) p.reject(new Error('CDP 연결이 닫혔습니다'));
      pending.clear();
    });
    ws.addEventListener('error', () => reject(new Error(`CDP 연결 실패: ${url}`)), { once: true });
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej, method }));
        },
        once(method) {
          return new Promise((res) => {
            const set = listeners.get(method) ?? new Set();
            const fn = (params) => {
              set.delete(fn);
              res(params);
            };
            set.add(fn);
            listeners.set(method, set);
          });
        },
        close() {
          ws.close();
        },
      }),
    );
  });
}

const KEYS = {
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
};

function createPage(client, close) {
  async function evaluate(expression) {
    const { result, exceptionDetails } = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(`페이지 스크립트 오류: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    return result.value;
  }

  async function mouse(x, y, clickCount) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await client.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount });
    }
  }

  return {
    evaluate,
    close,

    async goto(url) {
      const loaded = client.once('Page.loadEventFired');
      await client.send('Page.navigate', { url });
      await loaded;
    },

    async reload() {
      const loaded = client.once('Page.loadEventFired');
      await client.send('Page.reload');
      await loaded;
    },

    // expr이 truthy를 반환할 때까지 폴링하고 그 값을 돌려준다
    async waitFor(expr, timeout = 5000) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        last = await evaluate(expr);
        if (last) return last;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`waitFor 시간 초과 (${timeout}ms): ${expr}\n마지막 값: ${JSON.stringify(last)}`);
    },

    // 요소 중심에 실제 마우스 이벤트를 보낸다. clickCount 2면 더블클릭
    async click(selector, { clickCount = 1 } = {}) {
      const box = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!box) throw new Error(`요소 없음: ${selector}`);
      for (let n = 1; n <= clickCount; n++) await mouse(box.x, box.y, n);
    },

    async type(text) {
      await client.send('Input.insertText', { text });
    },

    async press(key) {
      const k = KEYS[key];
      if (!k) throw new Error(`지원하지 않는 키: ${key}`);
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, ...k });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
    },
  };
}
