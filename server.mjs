import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { delimiter, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.mjs';
import { makeRecipe } from './recipe.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const builds = process.env.LINUX_STUDIO_BUILDS_DIR
  ? resolve(process.env.LINUX_STUDIO_BUILDS_DIR)
  : join(root, 'builds');
const port = Number(process.env.PORT ?? '4177');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/catalog.mjs', ['catalog.mjs', 'text/javascript; charset=utf-8']],
]);
const jobs = new Map();
let latestJob;

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
const statuses = Object.fromEntries(await Promise.all(catalog.distros.map(async distro => {
  let message;
  let available = false;
  if (osValue('ID') !== distro.id || (distro.release && (osValue('VERSION_CODENAME') || osValue('VERSION_ID')) !== distro.release)) {
    const host = distro.needsVm ? `μια αποκλειστική VM με ${distro.name}` : `${distro.name} x86‑64`;
    message = `Για δημιουργία ISO χρειάζεται ${host}. Μπορείς να κατεβάσεις το σενάριο εδώ.`;
  } else if (distro.needsVm && spawnSync('systemd-detect-virt', ['--vm', '--quiet']).status !== 0) {
    message = `Για δημιουργία ISO με Lorax χρειάζεται μια αποκλειστική VM με ${distro.name}.`;
  } else {
    const commands = process.getuid() === 0 ? distro.commands : [...distro.commands, 'sudo'];
    const checks = await Promise.all(commands.map(executable));
    const missing = commands.filter((_, index) => !checks[index]);
    available = missing.length === 0;
    message = available
      ? `Δημιουργία με ${distro.tool}. Αν τρέχεις ως κανονικός χρήστης, εκτέλεσε sudo -v στο τερματικό της εφαρμογής.`
      : `Λείπουν εργαλεία δημιουργίας (${missing.join(', ')}). Δες τις οδηγίες εγκατάστασης και επανεκκίνησε την εφαρμογή.`;
  }
  return [distro.id, { available, message }];
})));

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readRecipe(request) {
  if (request.headers['content-type'] !== 'application/json') {
    throw new Error('Απαιτείται διαμόρφωση JSON.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 4096) {
      request.resume();
      throw new Error('Η διαμόρφωση είναι πολύ μεγάλη.');
    }
    chunks.push(chunk);
  }
  let options;
  try {
    options = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error('Άκυρη διαμόρφωση JSON.');
  }
  return makeRecipe(options);
}

function append(job, message) {
  job.log = (job.log + message).slice(-32_768);
}

async function runJob(job, recipe) {
  try {
    await mkdir(builds, { recursive: true, mode: 0o700 });
    await mkdir(job.directory, { mode: 0o700 });
    await writeFile(join(job.directory, 'build.sh'), recipe.script, { mode: 0o600, flag: 'wx' });
    await new Promise((resolve, reject) => {
      const child = spawn('/bin/bash', ['build.sh'], { cwd: job.directory, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8').on('data', chunk => append(job, chunk));
      }
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Η δημιουργία τερματίστηκε (${signal ?? code}).`));
      });
    });
    const file = await stat(join(job.directory, job.filename));
    if (!file.isFile() || !file.size) throw new Error('Το ISO λείπει ή είναι κενό.');
    job.bytes = file.size;
    job.state = 'ready';
  } catch (error) {
    append(job, `\n${error.message}\n`);
    job.state = 'failed';
  }
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");

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
      if (path === '/api/status') return json(response, 200, { statuses, latestJob });
      const match = /^\/api\/builds\/([a-f0-9-]+)(\/iso)?$/.exec(path);
      const job = match && jobs.get(match[1]);
      if (job && !match[2]) {
        const { id, state, log, filename, bytes } = job;
        return json(response, 200, { id, state, log, filename, bytes });
      }
      if (job?.state === 'ready' && match[2]) {
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
    if (request.method === 'POST' && ['/api/recipe', '/api/builds'].includes(path)) {
      let recipe;
      try {
        recipe = await readRecipe(request);
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
      if (path === '/api/recipe') {
        response.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="build-${recipe.distro}-iso.sh"`,
        });
        return response.end(recipe.script);
      }
      const builder = statuses[recipe.distro];
      if (!builder.available) return json(response, 503, { error: builder.message });
      if (jobs.get(latestJob)?.state === 'running') {
        return json(response, 409, { error: 'Υπάρχει ήδη μια δημιουργία ISO σε εξέλιξη.' });
      }
      if (process.getuid() !== 0 && spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore', timeout: 5000 }).status !== 0) {
        return json(response, 403, {
          error: 'Χρειάζεται πρόσβαση sudo. Κλείσε την εφαρμογή και ξεκίνησέ την από τερματικό με sudo -v && linux-studio ή sudo -v && node server.mjs.',
        });
      }
      const id = randomUUID();
      const job = { id, directory: join(builds, id), state: 'running', log: '', filename: recipe.filename };
      jobs.set(id, job);
      latestJob = id;
      void runJob(job, recipe);
      return json(response, 202, { id });
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

if (process.send) process.once('disconnect', () => process.exit());
