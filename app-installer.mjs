import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { linuxApps } from './linux-apps.mjs';

const remote = 'linux-studio-flathub';
const repository = 'https://dl.flathub.org/repo/flathub.flatpakrepo';
const known = new Map(linuxApps.map(app => [app.id, app]));

export function validateApps(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > linuxApps.length || ids.some(id => typeof id !== 'string' || !known.has(id))) {
    throw new Error('Επίλεξε εφαρμογές από τη βιβλιοθήκη του Linux Studio.');
  }
  return [...new Set(ids)];
}

export function parseOsRelease(content) {
  const values = {};
  for (const line of content.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return values;
}

// Only the Flatpak runtime is installed through the system's package manager.
// All catalog applications are installed in the current user's Flatpak scope.
export function setupPlan(os, binaries) {
  const family = [os.ID, ...(os.ID_LIKE ?? '').split(/\s+/)];
  if (family.some(id => ['debian', 'ubuntu'].includes(id)) && binaries['apt-get']) {
    return [[binaries['apt-get'], ['update']], [binaries['apt-get'], ['install', '-y', 'flatpak']]];
  }
  if (family.some(id => ['fedora', 'rhel', 'centos'].includes(id)) && binaries.dnf) {
    return [[binaries.dnf, ['install', '-y', 'flatpak']]];
  }
  if (family.includes('arch') && binaries.pacman) {
    return [[binaries.pacman, ['-S', '--needed', '--noconfirm', 'flatpak']]];
  }
  if (family.some(id => ['suse', 'opensuse', 'opensuse-tumbleweed', 'opensuse-leap'].includes(id)) && binaries.zypper) {
    return [[binaries.zypper, ['--non-interactive', 'install', 'flatpak']]];
  }
  return null;
}

async function findExecutable(name) {
  for (const folder of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = join(folder, name);
    try { await access(path, constants.X_OK); return path; } catch { /* Next directory. */ }
  }
  return null;
}

export function runAppCommand(command, args, { log = () => {}, timeout = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      env: { ...process.env, LC_ALL: 'C.UTF-8', DEBIAN_FRONTEND: 'noninteractive' } });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', chunk => { output = (output + chunk).slice(-65_536); log(chunk); });
    }
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve(output);
      else reject(new Error(timedOut ? 'Η εντολή ξεπέρασε το χρονικό όριο. Δοκίμασε ξανά.'
        : output.trim().slice(-1800) || `Η εντολή ${command.split('/').at(-1)} απέτυχε (${code}).`));
    });
  });
}

export function createAppInstaller({ platform = process.platform, uid = () => process.getuid?.(),
  find = findExecutable, run = runAppCommand,
  readOs = () => readFile('/etc/os-release', 'utf8').catch(() => '') } = {}) {
  let latest;
  const jobs = new Map();
  const active = () => latest?.state === 'running';
  const installedIds = output => output.split(/\s+/).filter(id => known.has(id));

  async function inspect() {
    const base = { platform, installed: [], canInstall: false, flatpak: false, latestJob: latest?.id };
    if (platform !== 'linux') return { ...base, distro: 'Windows', message: 'Για εγκατάσταση εφαρμογών στον υπολογιστή σου, άνοιξε το Linux Studio μέσα στο Linux. Η βιβλιοθήκη είναι διαθέσιμη για περιήγηση εδώ.' };
    const os = parseOsRelease(await readOs());
    base.distro = os.PRETTY_NAME || os.NAME || 'Linux';
    if (uid() === 0) return { ...base, message: 'Άνοιξε το Linux Studio ως κανονικός χρήστης, χωρίς sudo, για εγκατάσταση προσωπικών εφαρμογών.' };
    const flatpak = await find('flatpak');
    if (flatpak) {
      try {
        const output = await run(flatpak, ['list', '--app', '--columns=application'], { timeout: 15_000 });
        return { ...base, canInstall: true, flatpak: true, installed: installedIds(output), message: `Έτοιμο στο ${base.distro}. Η λήψη και η εγκατάσταση γίνονται εδώ, μέσω Flathub.` };
      } catch (error) {
        return { ...base, flatpak: true, message: `Δεν ήταν δυνατός ο έλεγχος του Flatpak: ${error.message}` };
      }
    }
    const names = ['apt-get', 'dnf', 'pacman', 'zypper', 'pkexec', 'sudo'];
    const binaries = Object.fromEntries(await Promise.all(names.map(async name => [name, await find(name)])));
    const plan = setupPlan(os, binaries);
    if (!plan) return { ...base, message: `Η βιβλιοθήκη λειτουργεί και στο ${base.distro} όταν υπάρχει Flatpak. Εγκατέστησε πρώτα το Flatpak από τον διαχειριστή λογισμικού της διανομής σου και πάτησε «Επανέλεγχος».` };
    if (!binaries.pkexec && !binaries.sudo) return { ...base, message: 'Χρειάζεται Flatpak. Για αυτόματη προετοιμασία απαιτείται PolicyKit ή sudo.' };
    return { ...base, canInstall: true, setupRequired: true, message: `Στο πρώτο Install θα εγκατασταθεί και το Flatpak στο ${base.distro}. Μπορεί να εμφανιστεί παράθυρο επιβεβαίωσης διαχειριστή.` };
  }

  async function prepare(log) {
    let flatpak = await find('flatpak');
    if (!flatpak) {
      const os = parseOsRelease(await readOs());
      const names = ['apt-get', 'dnf', 'pacman', 'zypper', 'pkexec', 'sudo'];
      const binaries = Object.fromEntries(await Promise.all(names.map(async name => [name, await find(name)])));
      const plan = setupPlan(os, binaries);
      if (!plan) throw new Error('Δεν υποστηρίζεται αυτόματη προετοιμασία Flatpak σε αυτή τη διανομή.');
      log('Προετοιμασία Flatpak…\n');
      for (const [command, args] of plan) {
        if (binaries.pkexec) await run(binaries.pkexec, [command, ...args], { log });
        else if (binaries.sudo) {
          try { await run(binaries.sudo, ['-n', command, ...args], { log }); }
          catch { throw new Error('Χρειάζεται επιβεβαίωση διαχειριστή. Εγκατέστησε το PolicyKit ή εκτέλεσε sudo -v στο τερματικό από όπου άνοιξες την εφαρμογή και δοκίμασε ξανά.'); }
        } else throw new Error('Δεν βρέθηκε τρόπος επιβεβαίωσης διαχειριστή.');
      }
      flatpak = await find('flatpak');
      if (!flatpak) throw new Error('Το Flatpak δεν βρέθηκε μετά την προετοιμασία.');
    }
    const remotes = await run(flatpak, ['remotes', '--user', '--columns=name,url'], { log, timeout: 15_000 });
    const existing = remotes.split('\n').map(line => line.trim().split(/\s+/)).find(([name]) => name === remote);
    if (existing && !['https://dl.flathub.org/repo', 'https://flathub.org/repo'].includes(existing[1]?.replace(/\/$/, ''))) {
      throw new Error('Το αποθετήριο linux-studio-flathub έχει διαφορετική διεύθυνση. Έλεγξε τη ρύθμισή του στο Flatpak.');
    }
    if (!existing) await run(flatpak, ['remote-add', '--user', '--if-not-exists', remote, repository], { log });
    return flatpak;
  }

  async function execute(job) {
    const log = value => { job.log = (job.log + value).slice(-32_768); };
    try {
      const flatpak = await prepare(log);
      for (const id of job.apps) {
        job.current = id;
        log(`\n── ${known.get(id).name} ──\n`);
        try {
          // Explicit user scope avoids privileged application installation.
          await run(flatpak, ['install', '--user', '--noninteractive', '--assumeyes', '--app', remote, id], { log });
          const installed = installedIds(await run(flatpak, ['list', '--app', '--columns=application'], { timeout: 15_000 }));
          if (!installed.includes(id)) throw new Error('Η εφαρμογή δεν εμφανίζεται στις εγκατεστημένες εφαρμογές Flatpak.');
          job.results.push({ id, state: 'ready' });
          log('Η εγκατάσταση επιβεβαιώθηκε.\n');
        } catch (error) {
          job.results.push({ id, state: 'failed', error: error.message });
          log(`Σφάλμα: ${error.message}\n`);
        }
      }
      job.state = job.results.some(result => result.state === 'failed') ? 'failed' : 'ready';
    } catch (error) {
      job.error = error.message;
      log(`\n${error.message}\n`);
      job.state = 'failed';
    } finally { job.current = null; }
  }

  // Validation and reservation happen synchronously, before any await.
  function start(ids) {
    const apps = validateApps(ids);
    if (platform !== 'linux' || uid() === 0) throw new Error('Η εγκατάσταση απαιτεί Linux Studio σε Linux ως κανονικό χρήστη.');
    if (active()) throw new Error('Μια εγκατάσταση βρίσκεται ήδη σε εξέλιξη.');
    latest = { id: randomUUID(), apps, state: 'running', current: null, results: [], log: '' };
    jobs.set(latest.id, latest);
    if (jobs.size > 20) jobs.delete(jobs.keys().next().value);
    void execute(latest);
    return latest.id;
  }

  return { inspect, start, active, job: id => jobs.get(id) };
}
