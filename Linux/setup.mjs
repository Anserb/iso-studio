import { execFile, fork, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const app = new URL('../', import.meta.url);
const home = homedir();
const data = isAbsolute(process.env.XDG_DATA_HOME ?? '') ? process.env.XDG_DATA_HOME : join(home, '.local', 'share');
const location = join(data, 'linux-studio');
const target = join(location, 'app');
let phase = 'idle', error, opening = false, applicationUrl;

const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Εγκατάσταση Linux Studio</title><link rel="icon" href="/logo.svg"><link rel="stylesheet" href="/setup.css"><script type="module" src="/setup.js"></script></head><body><main><img src="/logo.svg" width="96" height="96" alt="Linux Studio"><span>LINUX STUDIO / SETUP</span><h1>Το Linux σου.<br>Έτοιμο να δημιουργήσεις.</h1><p>Εγκατάστησε το Linux Studio για να φτιάχνεις ISO, να διαχειρίζεσαι εφαρμογές και να παραμετροποιείς το σύστημά σου.</p><ul><li>Προσθήκη στο μενού εφαρμογών</li><li>Ενσωματωμένο Node.js — χωρίς ξεχωριστή εγκατάσταση</li><li>Αυτόματες ενημερώσεις και έλεγχος κάθε λεπτό</li><li>Εγκατάσταση στο προσωπικό σου προφίλ, χωρίς sudo</li></ul><p id="status" role="status">Έτοιμο για εγκατάσταση.</p><button id="install">Εγκατάσταση Linux Studio ↓</button><button id="open" hidden>Άνοιγμα Linux Studio →</button><button id="cancel" class="secondary">Κλείσιμο</button><small>Linux x86-64 με glibc 2.28 ή νεότερη. Χρησιμοποιεί τον προεπιλεγμένο browser για το γραφικό περιβάλλον.</small></main></body></html>`;
const css = `:root{color-scheme:dark;font-family:Inter,"Segoe UI",system-ui,sans-serif;background:#0a1322;color:#edf6ff}*{box-sizing:border-box}body{margin:0;padding:clamp(20px,5vw,70px);background:radial-gradient(ellipse at top right,#173f58,transparent 65%)}main{max-width:650px;margin:auto;padding:clamp(25px,5vw,48px);border:1px solid #2d4662;border-radius:28px;background:#142137}main>span{display:block;color:#65d7f3;font-size:11px;letter-spacing:2px;margin:24px 0 16px}h1{font-size:clamp(30px,4vw,45px);line-height:1.12;letter-spacing:-2px;margin:0}p,li{color:#b0c5db;line-height:1.7;font-size:14px}ul{padding-left:20px;margin:24px 0}button{display:block;width:100%;border:1px solid #65d7f3;border-radius:11px;background:#65d7f3;color:#092339;padding:15px;font:700 14px inherit;cursor:pointer;margin-top:12px}.secondary{background:transparent;color:#b0c5db;border-color:#36516b}button:disabled{opacity:.5;cursor:wait}small{display:block;margin-top:24px;color:#91a9c1;line-height:1.7}#status[data-error]{color:#ffb2ab}[hidden]{display:none!important}`;
const script = `const $=id=>document.getElementById(id);async function api(path){const r=await fetch(path,{method:'POST'});const result=await r.json();if(!r.ok)throw Error(result.error);return result}function render(info){$('install').hidden=info.phase==='ready';$('install').disabled=info.phase==='installing';$('open').hidden=info.phase!=='ready';$('status').textContent=info.error||(info.phase==='installing'?'Εγκατάσταση εφαρμογής και ενσωματωμένου runtime…':info.phase==='ready'?'Εγκαταστάθηκε! Θα το βρεις και στο μενού εφαρμογών.':'Έτοιμο για εγκατάσταση.');$('status').toggleAttribute('data-error',Boolean(info.error))}async function refresh(){render(await fetch('/api/status').then(r=>r.json()))}async function attempt(fn){try{await fn()}catch(e){$('status').textContent=e.message;$('status').setAttribute('data-error','')}}$('install').onclick=()=>attempt(async()=>{render(await api('/api/install'))});$('open').onclick=()=>attempt(async()=>{const result=await api('/api/open');location.replace(result.url)});$('cancel').onclick=()=>attempt(async()=>{await api('/api/close');$('status').textContent='Ο εγκαταστάτης έκλεισε. Μπορείς να κλείσεις αυτή την καρτέλα.';for(const b of document.querySelectorAll('button'))b.disabled=true});setInterval(()=>refresh().catch(()=>{}),1000);refresh();`;

if (process.platform !== 'linux' || process.getuid() === 0) {
  console.error('Άνοιξε τον εγκαταστάτη στο Linux ως κανονικός χρήστης, χωρίς sudo.');
  process.exit(1);
}

async function install() {
  if (phase === 'installing' || phase === 'ready') return;
  phase = 'installing'; error = undefined;
  try {
    await run(process.execPath, [fileURLToPath(new URL('install.mjs', import.meta.url))], { env: { ...process.env, LINUX_STUDIO_BUNDLED_RUNTIME: '1', NODE_OPTIONS: '' }, timeout: 120_000, maxBuffer: 1024 * 1024 });
    phase = 'ready';
  } catch (failure) { error = failure.stderr?.trim() || failure.message; phase = 'error'; }
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const origin = `http://127.0.0.1:${server.address().port}`;
  if (request.headers.host !== origin.slice(7) || (request.method === 'POST' && request.headers.origin !== origin)) { response.writeHead(403); response.end('{}'); return; }
  const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
  try {
    if (request.method === 'GET') {
      const assets = { '/': [html, 'text/html'], '/setup.css': [css, 'text/css'], '/setup.js': [script, 'text/javascript'] };
      if (assets[request.url]) { const [body, type] = assets[request.url]; response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); response.end(body); return; }
      if (request.url === '/logo.svg') { response.writeHead(200, { 'Content-Type': 'image/svg+xml' }); response.end(await readFile(new URL('assets/linux-studio-logo.svg', app))); return; }
      if (request.url === '/api/status') return json(200, { phase, error });
    }
    if (request.method === 'POST' && request.url === '/api/install') { void install(); return json(202, { phase, error }); }
    if (request.method === 'POST' && request.url === '/api/close') { json(200, { closed: true }); server.close(); return; }
    if (request.method === 'POST' && request.url === '/api/open') {
      if (phase !== 'ready') return json(409, { error: 'Ολοκλήρωσε πρώτα την εγκατάσταση.' });
      if (opening) return json(409, { error: 'Η εφαρμογή ανοίγει…' });
      opening = true;
      try {
        if (!applicationUrl) {
          const env = { ...process.env, LINUX_STUDIO_BUNDLED_RUNTIME: '1', NODE_OPTIONS: '' };
          delete env.LINUX_STUDIO_PARENT_PID;
          const launcher = fork(join(target, 'Linux', 'launch.mjs'), ['--no-browser'], { execPath: join(location, 'runtime', `node-v${process.versions.node}`), env, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
          const port = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { launcher.kill(); reject(new Error('Η εφαρμογή δεν ξεκίνησε εγκαίρως.')); }, 20_000);
            launcher.once('message', message => { clearTimeout(timeout); resolve(message.port); });
            launcher.once('error', failure => { clearTimeout(timeout); reject(failure); });
            launcher.once('exit', code => { clearTimeout(timeout); reject(new Error(`Η εφαρμογή έκλεισε (${code}).`)); });
          });
          applicationUrl = `http://127.0.0.1:${port}`;
          launcher.disconnect(); launcher.unref();
        }
        json(200, { url: applicationUrl });
        setTimeout(() => server.close(), 1000);
      } finally { opening = false; }
      return;
    }
    json(404, { error: 'Δεν βρέθηκε.' });
  } catch (failure) { json(500, { error: failure.message }); }
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Linux Studio Setup · ${url}`);
  process.send?.({ port: server.address().port });
  if (!process.argv.includes('--no-browser')) {
    const browser = spawn('xdg-open', [url], { stdio: 'ignore' });
    browser.on('error', () => console.log(`Άνοιξε τον εγκαταστάτη: ${url}`));
  }
});
const timeout = setTimeout(() => { if (phase !== 'installing') server.close(); }, 20 * 60_000);
timeout.unref(); server.once('close', () => clearTimeout(timeout));
if (process.send) process.once('disconnect', () => server.close());
