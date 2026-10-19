// 최소 Chrome DevTools Protocol 클라이언트 — headless Chrome을 띄워 내장 WebSocket으로 조작한다
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_SUFFIX = path.join('Google', 'Chrome', 'Application', 'chrome.exe');
const CDP_TIMEOUT = 10000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      // 청크가 URL 중간에서 잘릴 수 있으므로 줄 끝까지 받은 뒤 사용한다
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)\r?\n/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.once('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Chrome을 실행하지 못했습니다: ${e.message}`));
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome이 시작 중 종료되었습니다 (code ${code}):\n${buf}`));
    });
  });
}

// --headless=new는 DevTools 주소 출력 직후 page 타깃이 아직 없을 수 있다
async function pageTarget(port) {
  const origin = `http://127.0.0.1:${port}`;
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const targets = await (await fetch(`${origin}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (page) return page;
    await sleep(100);
  }
  const res = await fetch(`${origin}/json/new?about:blank`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Chrome page 타깃을 만들지 못했습니다 (${res.status})`);
  return res.json();
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
  // spawn 실패 시에는 'exit' 없이 'error'만 온다
  const exited = new Promise((r) => {
    proc.once('exit', r);
    proc.once('error', r);
  });

  // 연결 전에 실패해도 Chrome과 임시 폴더를 남기지 않는다
  async function kill() {
    if (proc.pid && proc.exitCode === null && proc.signalCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      else proc.kill();
      await exited;
    }
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }

  try {
    const { port } = new URL(await waitForDevToolsUrl(proc));
    const client = await connect((await pageTarget(port)).webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    return createPage(client, async () => {
      client.close();
      await kill();
    });
  } catch (e) {
    // 정리 실패가 원래 기동 실패 원인을 가리지 않게 한다
    await kill().catch((err) => {
      e.message += `\n(정리 실패: ${err.message})`;
    });
    throw e;
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const waiters = new Set();

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p?.reject(new Error(`${msg.error.message} (${p.method})`));
        else p?.resolve(msg.result);
      } else {
        for (const w of [...waiters]) if (w.method === msg.method) w.resolve(msg.params);
      }
    });
    ws.addEventListener('close', () => {
      const err = new Error('CDP 연결이 닫혔습니다');
      for (const p of pending.values()) p.reject(err);
      for (const w of [...waiters]) w.reject(err);
    });
    ws.addEventListener('error', () => reject(new Error(`CDP 연결 실패: ${url}`)), { once: true });

    // 응답·이벤트 대기는 모두 시간 제한을 둔다
    function track(map, key, label, extra = {}) {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => entry.reject(new Error(`CDP ${label} 시간 초과 (${CDP_TIMEOUT}ms)`)), CDP_TIMEOUT);
        const done = (fn) => (v) => {
          clearTimeout(timer);
          map.delete(key ?? entry);
          fn(v);
        };
        const entry = { ...extra, resolve: done(res), reject: done(rej) };
        if (key === undefined) map.add(entry);
        else map.set(key, entry);
      });
    }

    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          const result = track(pending, id, method, { method });
          ws.send(JSON.stringify({ id, method, params }));
          return result;
        },
        once(method) {
          return track(waiters, undefined, `이벤트 ${method}`, { method });
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
  Backspace: { code: 'Backspace', windowsVirtualKeyCode: 8 },
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
        await sleep(50);
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
