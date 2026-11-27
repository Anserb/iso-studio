import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.mjs';
import { createAppInstaller } from './app-installer.mjs';
import { createStudioStore } from './studio-store.mjs';
import { createAutoUpdates } from './auto-updates.mjs';
import { checkPreflight, createVmService, listUsbDisks, writeUsb, verifyIso, isoHash } from './studio-tools.mjs';
import { makeRecipe } from './recipe.mjs';
import { createUpdater } from './updates.mjs';
import { buildInWsl, inspectWsl, inspectWslDistro, runLogged, runToolSetup, setupWsl } from './wsl-build.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const windows = process.platform === 'win32';
const windowsHost = windows && process.env.LINUX_STUDIO_WINDOWS_HOST === '1';
const builds = process.env.LINUX_STUDIO_BUILDS_DIR
  ? resolve(process.env.LINUX_STUDIO_BUILDS_DIR)
  : windows ? join(process.env.LOCALAPPDATA ?? homedir(), 'linux-studio', 'builds') : join(root, 'builds');
const port = Number(process.env.PORT ?? '4177');
const configHome = process.platform === 'win32' ? process.env.LOCALAPPDATA : process.env.XDG_CONFIG_HOME;
const appearance = join(isAbsolute(configHome ?? '') ? configHome : join(homedir(), '.config'), 'linux-studio', 'appearance');
const dataHome = process.env.XDG_DATA_HOME;
const linuxApp = join(isAbsolute(dataHome ?? '') ? dataHome : join(homedir(), '.local', 'share'), 'linux-studio', 'app');
const installed = process.platform === 'linux' ? process.getuid() !== 0 && resolve(root) === await realpath(linuxApp).catch(() => null)
  : process.platform === 'win32' && process.env.LINUX_STUDIO_WINDOWS_SETUP === '1';
const updater = createUpdater({ directory: join(dirname(appearance), 'updates'), installed });
const store = createStudioStore(join(dirname(appearance), 'studio'));
const appInstaller = createAppInstaller({ onComplete: entry => store.record(entry) });
const vm = createVmService();
const autoUpdates = createAutoUpdates({ file: join(dirname(appearance), 'auto-updates.json'), updater,
  busy: occupied, install: async () => {
    if (occupied()) return;
    applyingUpdate = true;
    try {
      if (await updater.install()) {
        if (windows) console.log('Linux Studio · update-started');
        else if (installed && process.send) process.send({ restart: true });
      }
    }
    finally { applyingUpdate = false; }
  },
});
await autoUpdates.load();
let applyingUpdate = false;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/catalog.mjs', ['catalog.mjs', 'text/javascript; charset=utf-8']],
  ['/desktop-appearance.mjs', ['desktop-appearance.mjs', 'text/javascript; charset=utf-8']],
  ['/linux-apps.mjs', ['linux-apps.mjs', 'text/javascript; charset=utf-8']],
  ['/app-library.mjs', ['app-library.mjs', 'text/javascript; charset=utf-8']],
  ['/studio-ui.mjs', ['studio-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/studio-customization.mjs', ['studio-customization.mjs', 'text/javascript; charset=utf-8']],
  ['/logo.svg', ['assets/linux-studio-logo.svg', 'image/svg+xml']],
]);
const jobs = new Map();
let latestJob;
for (const entry of (await store.list()).history) {
  if (entry.kind === 'build' && /^[a-f\d-]{36}$/.test(entry.id) && /^[a-z\d-]+\.iso$/.test(entry.filename || '')) {
    jobs.set(entry.id, { ...entry, directory: join(builds, entry.id), state: entry.state === 'running' ? 'interrupted' : entry.state });
  }
}

async function executable(name) {
  const folders = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  try {
    await Promise.any(folders.map(folder => access(join(folder, name), constants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

const osRelease = process.platform === 'linux' && process.arch === 'x64'
  ? await readFile('/etc/os-release', 'utf8').catch(() => '') : '';
const osValue = key => new RegExp(`^${key}="?([^"\\r\\n]*)"?$`, 'm').exec(osRelease)?.[1];
async function inspectNative(distro) {
  let message;
  let available = false;
  if (osValue('ID') !== distro.id || (distro.release && (osValue('VERSION_CODENAME') || osValue('VERSION_ID')) !== distro.release)) {
    const host = distro.needsVm ? `μια αποκλειστική VM με ${distro.name}` : `${distro.name} x86‑64`;
    message = `Για δημιουργία αυτού του ISO χρειάζεται ${host}.`;
  } else if (distro.needsVm && spawnSync('systemd-detect-virt', ['--vm', '--quiet']).status !== 0) {
    message = `Για δημιουργία ISO με Lorax χρειάζεται μια αποκλειστική VM με ${distro.name}.`;
  } else {
    const checks = await Promise.all(distro.commands.map(executable));
    const missing = distro.commands.filter((_, index) => !checks[index]);
    available = missing.length === 0;
    const authentication = process.getuid() === 0 ? 'root'
      : await executable('pkexec') ? 'pkexec'
      : await executable('sudo') ? 'sudo' : null;
    message = available
      ? `Έτοιμο για δημιουργία με ${distro.tool}.`
      : `Χρειάζονται τα εργαλεία ${distro.tool} για να δημιουργηθεί το ISO.`;
    if (!authentication) return { available: false, message: 'Χρειάζονται δικαιώματα διαχειριστή μέσω PolicyKit ή sudo.' };
    return { available, message, authentication, setup: !available && authentication !== 'sudo' ? 'tools' : undefined };
  }
  return { available, message };
}

async function getStatus(distro, entries) {
  const status = windows ? await inspectWslDistro(distro, entries) : await inspectNative(distro);
  if (status.setup === 'wsl' && !windowsHost) delete status.setup;
  return status;
}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request, maximum = 4096) {
  if (request.headers['content-type'] !== 'application/json') {
    throw new Error('Απαιτείται διαμόρφωση JSON.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maximum) {
      request.resume();
      throw new Error('Η διαμόρφωση είναι πολύ μεγάλη.');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error('Άκυρη διαμόρφωση JSON.');
  }
}

function append(job, message) {
  job.log = (job.log + message).slice(-32_768);
}

async function runJob(job, recipe, environment) {
  try {
    await mkdir(builds, { recursive: true, mode: 0o700 });
    await mkdir(job.directory, { mode: 0o700 });
    const output = join(job.directory, job.filename);
    const log = message => append(job, message);
    let expectedSize;
    if (windows) {
      try {
        expectedSize = await buildInWsl(environment.name, job.id, recipe, output, log);
      } catch (error) {
        await rm(output, { force: true });
        throw error;
      }
    } else {
      await writeFile(join(job.directory, 'build.sh'), recipe.script, { mode: 0o600, flag: 'wx' });
      if (environment.authentication === 'pkexec') {
        await runLogged('pkexec', ['/bin/bash', '-c', 'cd -- "$1" && /bin/bash ./build.sh && chown -- "$2" "$3"', 'build',
          job.directory, `${process.getuid()}:${process.getgid()}`, recipe.filename], log);
      } else {
        await runLogged('/bin/bash', ['build.sh'], log, { cwd: job.directory });
      }
    }
    const file = await stat(output);
    if (!file.isFile() || file.size < 32774 || (expectedSize && file.size !== expectedSize)) throw new Error('Το ISO λείπει ή είναι ελλιπές.');
    const handle = await open(output, 'r');
    try {
      const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 32769);
      if (buffer.toString('ascii') !== 'CD001') throw new Error('Το αρχείο δεν είναι έγκυρη εικόνα ISO 9660.');
    } finally {
      await handle.close();
    }
    job.bytes = file.size;
    append(job, '\nΥπολογισμός SHA-256…\n');
    job.sha256 = await isoHash(output);
    job.state = 'ready';
  } catch (error) {
    append(job, `\n${error.message}\n`);
    job.state = 'failed';
  } finally { await store.record({ ...job, directory: undefined }).catch(error => append(job, `\nΙστορικό: ${error.message}\n`)); }
}

function occupied() {
  return applyingUpdate || vm.active() || appInstaller.active() || jobs.get(latestJob)?.state === 'running';
}

function createJob(kind, filename) {
  const id = randomUUID();
  const job = { id, kind, directory: join(builds, id), createdAt: new Date().toISOString(), state: 'running', log: '', filename };
  jobs.set(id, job);
  latestJob = id;
  return job;
}

async function runSetup(job, distro, environment) {
  try {
    const log = message => append(job, message);
    if (windows) await setupWsl(distro, environment, log);
    else await runToolSetup(distro.id, (command, args) => environment.authentication === 'root'
      ? runLogged(command, args, log) : runLogged('pkexec', [command, ...args], log));
    job.state = 'ready';
  } catch (error) {
    append(job, `\n${error.message}\n`);
    job.state = 'failed';
  } finally { await store.record({ ...job, directory: undefined }).catch(() => {}); }
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");

  const hosts = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`];
  const host = request.headers.host;
  if (!hosts.includes(host) || (request.method === 'POST' && request.headers.origin !== `http://${host}`)) {
    return json(response, 403, { error: 'Η εφαρμογή δέχεται αιτήματα από το τοπικό παράθυρο.' });
  }

  try {
    const path = request.url.split('?')[0];
    if (request.method === 'GET') {
      const asset = assets.get(path);
      if (asset) {
        const content = await readFile(join(root, asset[0]));
        response.writeHead(200, { 'Content-Type': asset[1] });
        return response.end(content);
      }
      if (path === '/api/status') {
        const entries = windows ? await inspectWsl() : undefined;
        const statuses = Object.fromEntries(await Promise.all(catalog.distros.map(async distro => [
          distro.id, await getStatus(distro, entries),
        ])));
        return json(response, 200, { statuses, latestJob: ['build', 'setup'].includes(jobs.get(latestJob)?.kind) ? latestJob : undefined, busy: occupied(), toolJob: jobs.get(latestJob)?.kind === 'usb' ? latestJob : undefined });
      }
      if (path === '/api/update') return json(response, 200, { ...updater.info(), restartAutomatic: installed && (windows || Boolean(process.send)) });
      if (path === '/api/update/settings') return json(response, 200, autoUpdates.info());
      if (path === '/api/apps/status') return json(response, 200, await appInstaller.inspect());
      if (path === '/api/apps/installed') return json(response, 200, { apps: await appInstaller.inventory(), platform: process.platform });
      if (path === '/api/profiles' || path === '/api/history') {
        const data = await store.list();
        return json(response, 200, path === '/api/profiles' ? data.profiles : data.history.map(entry => ({ ...entry, state: entry.state === 'running' && jobs.get(entry.id)?.state !== 'running' && appInstaller.job(entry.id)?.state !== 'running' ? 'interrupted' : entry.state })));
      }
      const storedMatch = /^\/api\/(profiles|history)\/([a-f\d-]{36})$/.exec(path);
      if (storedMatch) {
        const data = storedMatch[1] === 'profiles' ? await store.profile(storedMatch[2]) : await store.history(storedMatch[2]);
        return data ? json(response, 200, data) : json(response, 404, { error: 'Η καταχώριση δεν βρέθηκε.' });
      }
      if (path === '/api/vm') return json(response, 200, await vm.status());
      if (path === '/api/usb') return json(response, 200, await listUsbDisks());
      const appJobMatch = /^\/api\/apps\/jobs\/([a-f0-9-]+)$/.exec(path);
      if (appJobMatch) {
        const job = appInstaller.job(appJobMatch[1]);
        return job ? json(response, 200, job) : json(response, 404, { error: 'Η εργασία εγκατάστασης δεν βρέθηκε.' });
      }
      if (path === '/api/update/file') {
        const update = await updater.verifiedUpdate();
        if (!update) return json(response, 404, { error: 'Δεν υπάρχει διαθέσιμο πακέτο ενημέρωσης.' });
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${update.name}"`,
          'Content-Length': update.size,
        });
        await pipeline(createReadStream(update.path), response);
        return;
      }
      if (path === '/api/appearance') {
        const theme = await readFile(appearance, 'utf8').catch(error => {
          if (error.code !== 'ENOENT') throw error;
          return 'dark';
        });
        return json(response, 200, { theme: theme === 'light' ? 'light' : 'dark' });
      }
      const match = /^\/api\/builds\/([a-f0-9-]+)(\/iso)?$/.exec(path);
      const job = match && jobs.get(match[1]);
      if (job && !match[2]) {
        const { id, kind, state, log, filename, bytes, sha256 } = job;
        return json(response, 200, { id, kind, state, log, filename, bytes, sha256 });
      }
      if (job?.kind === 'build' && job.state === 'ready' && match[2]) {
        const filePath = join(job.directory, job.filename);
        const info = await stat(filePath);
        response.writeHead(200, {
          'Content-Type': 'application/x-iso9660-image',
          'Content-Disposition': `attachment; filename="${job.filename}"`,
          'Content-Length': info.size,
        });
        await pipeline(createReadStream(filePath), response);
        return;
      }
    }
    if (request.method === 'POST' && path === '/api/update/settings') {
      const { enabled } = await readJson(request);
      await autoUpdates.save(enabled);
      return json(response, 200, autoUpdates.info());
    }
    if (request.method === 'POST' && path === '/api/profiles') {
      try {
        const options = await readJson(request, 32 * 1024 ** 2);
        const profile = await store.saveProfile(options.label, options.options, options.id);
        return json(response, 200, profile);
      } catch (error) { return json(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && path === '/api/profiles/delete') {
      const { id } = await readJson(request);
      await store.deleteProfile(id);
      return json(response, 200, { deleted: true });
    }
    if (request.method === 'POST' && path === '/api/preflight') {
      try {
        const options = await readJson(request, 32 * 1024 ** 2);
        makeRecipe(options);
        const distro = catalog.distros.find(item => item.id === options.distro);
        const environment = await getStatus(distro, windows ? await inspectWsl() : undefined);
        return json(response, 200, await checkPreflight(builds, options, environment));
      } catch (error) { return json(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && ['/api/apps/manage', '/api/apps/launch'].includes(path)) {
      try {
        const options = await readJson(request, 64 * 1024);
        if (occupied()) return json(response, 409, { error: 'Περίμενε να ολοκληρωθεί η τρέχουσα εργασία.' });
        if (path === '/api/apps/launch') { await appInstaller.launch(options.id, options.scope); return json(response, 200, { launched: true }); }
        return json(response, 202, { id: appInstaller.startAction(options.action, options.apps) });
      } catch (error) { return json(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && path === '/api/vm/stop') { vm.stop(); return json(response, 200, await vm.status()); }
    if (request.method === 'POST' && ['/api/vm/start', '/api/usb/write'].includes(path)) {
      try {
        const options = await readJson(request);
        if (occupied()) return json(response, 409, { error: 'Περίμενε να ολοκληρωθεί η τρέχουσα εργασία.' });
        const image = jobs.get(options.id);
        if (!image || image.kind !== 'build' || image.state !== 'ready') throw new Error('Επίλεξε ολοκληρωμένο ISO από το ιστορικό.');
        const source = join(image.directory, image.filename);
        await verifyIso(source);
        if (path === '/api/vm/start') return json(response, 200, await vm.start(source, options.memory));
        if (occupied()) return json(response, 409, { error: 'Υπάρχει ήδη εργασία σε εξέλιξη.' });
        const job = createJob('usb');
        await store.record({ ...job, directory: undefined });
        void (async () => {
          try { await writeUsb(source, options, value => append(job, value)); job.state = 'ready'; }
          catch (error) { append(job, error.message); job.state = 'failed'; }
          finally { await store.record({ ...job, directory: undefined }).catch(() => {}); }
        })();
        return json(response, 202, { id: job.id });
      } catch (error) { return json(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && path === '/api/apps/install') {
      let options;
      try { options = await readJson(request); }
      catch (error) { return json(response, 400, { error: error.message }); }
      if (occupied()) return json(response, 409, { error: 'Περίμενε να ολοκληρωθεί η εργασία που εκτελείται.' });
      try {
        const id = appInstaller.start(options?.apps);
        return json(response, 202, { id });
      } catch (error) { return json(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && path === '/api/update/check') {
      void updater.check();
      return json(response, 202, updater.info());
    }
    if (request.method === 'POST' && path === '/api/update/install') {
      if (occupied()) {
        return json(response, 409, { error: 'Περίμενε να ολοκληρωθεί η εργασία που εκτελείται.' });
      }
      applyingUpdate = true;
      try {
        if (!(await updater.install())) return json(response, 409, { error: 'Η εγκατάσταση της ενημέρωσης δεν είναι διαθέσιμη.' });
        json(response, 200, { ...updater.info(), restartAutomatic: installed && (windows || Boolean(process.send)) });
        if (process.platform === 'win32') console.log('Linux Studio · update-started');
        else if (installed && process.send) setTimeout(() => process.send?.({ restart: true }), 300);
        return;
      } catch (error) {
        return json(response, 500, { error: error.message });
      } finally {
        applyingUpdate = false;
      }
    }
    if (request.method === 'POST' && path === '/api/appearance') {
      let theme;
      try {
        theme = (await readJson(request))?.theme;
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
      if (theme !== 'light' && theme !== 'dark') return json(response, 400, { error: 'Άγνωστο θέμα.' });
      await mkdir(dirname(appearance), { recursive: true, mode: 0o700 });
      const staged = `${appearance}.${randomUUID()}.tmp`;
      try {
        await writeFile(staged, theme, { flag: 'wx', mode: 0o600 });
        await rename(staged, appearance);
      } finally {
        await rm(staged, { force: true });
      }
      return json(response, 200, { theme });
    }
    if (request.method === 'POST' && ['/api/builds', '/api/setup'].includes(path)) {
      if (occupied()) return json(response, 409, { error: 'Υπάρχει ήδη εργασία σε εξέλιξη.' });
      let options;
      let recipe;
      try {
        options = await readJson(request, 32 * 1024 ** 2);
        if (path === '/api/builds') recipe = makeRecipe(options);
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
      const distro = catalog.distros.find(item => item.id === options?.distro);
      if (!distro) return json(response, 400, { error: 'Επίλεξε υποστηριζόμενη διανομή.' });
      const builder = await getStatus(distro, windows ? await inspectWsl() : undefined);
      if (occupied()) return json(response, 409, { error: 'Υπάρχει ήδη εργασία σε εξέλιξη.' });
      if (path === '/api/setup') {
        if (!builder.setup) return json(response, 409, { error: builder.message });
        if (builder.setup === 'wsl') {
          json(response, 200, { systemSetup: true });
          console.log('Linux Studio · enable-wsl');
          return;
        }
        const job = createJob('setup');
        void runSetup(job, distro, builder);
        return json(response, 202, { id: job.id });
      }
      if (!builder.available) return json(response, 503, { error: builder.message });
      const preflight = await checkPreflight(builds, options, builder);
      if (!preflight.ready) return json(response, 409, { error: preflight.checks.filter(check => check.state === 'error').map(check => check.detail).join(' ') });
      if (occupied()) return json(response, 409, { error: 'Υπάρχει ήδη εργασία σε εξέλιξη.' });
      if (!windows && builder.authentication !== 'root' && spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore', timeout: 2500 }).status === 0) {
        builder.authentication = 'sudo';
      } else if (builder.authentication === 'sudo') {
        return json(response, 403, {
          error: 'Χρειάζεται επιβεβαίωση διαχειριστή. Εκτέλεσε sudo -v στο τερματικό από όπου άνοιξε η εφαρμογή και δοκίμασε ξανά.',
        });
      }
      const job = createJob('build', recipe.filename);
      job.options = options;
      await store.record({ ...job, directory: undefined });
      void runJob(job, recipe, builder);
      return json(response, 202, { id: job.id });
    }
    return json(response, 404, { error: 'Η διεύθυνση δεν βρέθηκε.' });
  } catch (error) {
    if (response.headersSent || response.destroyed) return response.destroy();
    console.error(error.message);
    return json(response, 500, { error: 'Προέκυψε σφάλμα κατά την επεξεργασία του αιτήματος.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Linux Studio · http://127.0.0.1:${server.address().port}`);
  process.send?.({ port: server.address().port });
});

const updateClock = setInterval(() => void autoUpdates.tick(), 60_000);
updateClock.unref();
void autoUpdates.tick();
server.once('close', () => { clearInterval(updateClock); vm.stop(); });
process.once('exit', () => vm.stop());

if (process.send) process.once('disconnect', () => process.exit());
