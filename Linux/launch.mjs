import { fork, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Απαιτείται Node.js 22 ή νεότερο.');
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const env = { ...process.env, PORT: '0' };
if (process.platform === 'linux') {
  const data = process.env.XDG_DATA_HOME;
  env.LINUX_STUDIO_BUILDS_DIR ??= join(data && isAbsolute(data) ? data : join(homedir(), '.local', 'share'), 'linux-studio', 'builds');
}
delete env.NODE_OPTIONS;
delete env.LINUX_STUDIO_PARENT_PID;
const server = fork(fileURLToPath(new URL('server.mjs', root)), {
  cwd: root, env, execArgv: [], stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});

const timeout = setTimeout(() => {
  console.error('Ο server δεν απάντησε εγκαίρως.');
  shutdown(1);
}, 15_000);

function shutdown(code) {
  process.exitCode = code;
  server.kill();
}

server.once('error', (error) => {
  clearTimeout(timeout);
  console.error(error.message);
  process.exitCode = 1;
});
server.once('exit', (code) => {
  clearTimeout(timeout);
  process.exitCode ??= code ?? 1;
});
server.once('message', ({ port }) => {
  clearTimeout(timeout);
  const url = `http://127.0.0.1:${port}`;
  console.log('Άφησε αυτό το τερματικό ανοιχτό. Πάτησε Ctrl+C για έξοδο.');
  if (process.argv.includes('--no-browser')) return;

  const browser = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  const manual = () => console.log(`Άνοιξε χειροκίνητα τη διεύθυνση ${url}`);
  browser.once('error', manual);
  browser.once('exit', (code) => { if (code !== 0) manual(); });
  browser.unref();
});
process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(143));
if (process.platform === 'linux') process.once('SIGHUP', () => shutdown(129));

const parent = Number(process.env.LINUX_STUDIO_PARENT_PID);
if (Number.isSafeInteger(parent) && parent > 0) {
  setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch (error) {
      if (error.code === 'ESRCH') shutdown(0);
    }
  }, 1000).unref();
}
