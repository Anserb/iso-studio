import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

export const packageLists = {
  debian: ['live-build', 'debootstrap', 'debian-archive-keyring', 'xorriso', 'squashfs-tools', 'syslinux-common', 'isolinux', 'grub-common', 'grub-efi-amd64-bin'],
  ubuntu: ['debootstrap', 'ubuntu-keyring', 'systemd-container', 'squashfs-tools', 'xorriso', 'mtools', 'grub-common', 'grub-pc-bin', 'grub-efi-amd64-bin'],
  arch: ['archiso'],
  fedora: ['lorax-lmc-novirt'],
};
const profiles = {
  debian: ['Debian', 'LinuxStudio-Debian'],
  ubuntu: ['Ubuntu-24.04', 'LinuxStudio-Ubuntu'],
  arch: ['archlinux', 'LinuxStudio-Arch'],
};
const run = promisify(execFile);
const wsl = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wsl.exe') : 'wsl.exe';

function decode(buffer) {
  return buffer.includes(0) ? buffer.toString('utf16le').replace(/\uFEFF/g, '') : buffer.toString('utf8');
}

export function parseWslList(buffer) {
  const entries = new Map();
  for (const line of decode(buffer).split(/\r?\n/)) {
    const row = /^\s*\*?\s*(.+?)\s{2,}.*?\s+([12])\s*$/.exec(line);
    if (row) entries.set(row[1], Number(row[2]));
  }
  return entries;
}

const argsFor = (name, ...args) => ['--distribution', name, '--user', 'root', '--cd', '/', '--exec', ...args];
async function capture(args) {
  const { stdout } = await run(wsl, args, { encoding: 'buffer', windowsHide: true, timeout: 15_000 });
  return stdout;
}

export async function inspectWsl() {
  try {
    return parseWslList(await capture(['--list', '--verbose']));
  } catch {
    // An empty installation also returns a nonzero code for --list.
    try {
      await capture(['--status']);
      return new Map();
    } catch {
      return null;
    }
  }
}

export async function inspectWslDistro(distro, entries) {
  const profile = profiles[distro.id];
  if (!profile) return { available: false, message: `Η δημιουργία Fedora απαιτεί αποκλειστική VM με ${distro.name}.` };
  if (entries === null) return { available: false, setup: 'wsl', message: 'Η δημιουργία στα Windows χρειάζεται WSL 2. Μπορεί να ζητηθεί επανεκκίνηση των Windows.' };

  const [upstream, name] = profile;
  if (!entries.has(name)) return { available: false, setup: 'distro', name, upstream, message: `Η εφαρμογή μπορεί να κατεβάσει το ${distro.name} και τα εργαλεία δημιουργίας σε ξεχωριστό περιβάλλον WSL 2.` };
  if (entries.get(name) !== 2) return { available: false, message: `Το περιβάλλον ${name} πρέπει να χρησιμοποιεί WSL 2.` };

  try {
    const probe = decode(await capture(argsFor(name, '/bin/bash', '-c',
      '. /etc/os-release; printf "%s\\n" "$ID" "${VERSION_CODENAME:-${VERSION_ID:-}}" "$(uname -m)"; for tool; do command -v "$tool" >/dev/null || printf "%s\\n" "$tool"; done',
      'probe', ...distro.commands))).trimEnd().split(/\r?\n/);
    if (probe[0] !== distro.id || (distro.release && probe[1] !== distro.release) || probe[2] !== 'x86_64') {
      return { available: false, message: `Το ${name} δεν ταιριάζει με το προφίλ ${distro.name} x86‑64.` };
    }
    if (probe.length > 3) return { available: false, setup: 'tools', name, message: `Χρειάζεται να εγκατασταθούν τα εργαλεία ${distro.tool} στο ${name}.` };
    return { available: true, name, message: `Έτοιμο για δημιουργία με ${distro.tool} μέσα στο ${name}.` };
  } catch {
    return { available: false, message: `Το ${name} δεν ξεκίνησε. Έλεγξε τη λειτουργία του WSL 2 και πάτησε επανέλεγχο.` };
  }
}

export function waitForProcess(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Η εντολή τερματίστηκε (${signal ?? code}). Δες την καταγραφή.`));
    });
  });
}

export async function runLogged(command, args, append, options = {}) {
  const { input, ...spawnOptions } = options;
  const child = spawn(command, args, { ...spawnOptions, windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', append);
  if (input) {
    child.stdin.on('error', () => { /* The process reports early termination through stderr and its exit status. */ });
    child.stdin.end(input);
  }
  await waitForProcess(child);
}

export function runToolSetup(distro, invoke) {
  const packages = packageLists[distro];
  if (distro === 'arch') return invoke('pacman', ['-Syu', '--needed', '--noconfirm', ...packages]);
  if (distro === 'fedora') return invoke('dnf', ['install', '-y', ...packages]);
  return invoke('/bin/bash', ['-c', 'export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y "$@"', 'setup', ...packages]);
}

export async function setupWsl(distro, environment, append) {
  if (environment.setup === 'distro') {
    await runLogged(wsl, ['--install', '--distribution', environment.upstream, '--name', environment.name, '--no-launch', '--web-download'], append);
    if ((await inspectWsl())?.get(environment.name) === 1) {
      await runLogged(wsl, ['--set-version', environment.name, '2'], append);
    }
    const checked = await inspectWslDistro(distro, await inspectWsl());
    if (checked.available) return;
    if (checked.setup !== 'tools') throw new Error(checked.message);
  }
  await runToolSetup(distro.id, (command, args) => runLogged(wsl, argsFor(environment.name, command, ...args), append));
}

export async function buildInWsl(name, id, recipe, target, append) {
  const directory = `/var/tmp/linux-studio-${id}`;
  const file = `${directory}/${recipe.filename}`;
  const setup = 'umask 077; mkdir -- "$1" && cd -- "$1" && cat > build.sh && exec /bin/bash build.sh';
  let complete = false;
  try {
    await runLogged(wsl, argsFor(name, '/bin/bash', '-c', setup, 'build', directory), append, { input: recipe.script });
    const size = Number(decode(await capture(argsFor(name, '/usr/bin/stat', '-c', '%s', file))).trim());
    if (!Number.isSafeInteger(size) || size < 32774) throw new Error('Το εργαλείο δεν παρήγαγε πλήρες ISO.');
    append('Μεταφορά του ISO στον φάκελο λήψης της εφαρμογής…\n');
    const child = spawn(wsl, argsFor(name, '/bin/cat', '--', file), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.setEncoding('utf8').on('data', append);
    await Promise.all([pipeline(child.stdout, createWriteStream(target, { flags: 'wx' })), waitForProcess(child)]);
    complete = true;
    return size;
  } finally {
    if (complete) {
      // Keep the temporary directory if any mount is still present inside it.
      await capture(argsFor(name, '/bin/bash', '-c',
        'if ! grep -qE "^([^ ]+ ){4}$1(/| )" /proc/self/mountinfo; then rm -rf --one-file-system -- "$1"; fi',
        'cleanup', directory)).catch(() => {});
    }
  }
}
