import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, mkdir, open, readFile, stat, statfs } from 'node:fs/promises';
import { freemem } from 'node:os';
import { delimiter, join } from 'node:path';
import { runAppCommand, parseOsRelease } from './app-installer.mjs';

export async function findTool(name) {
  for (const folder of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = join(folder, name + (process.platform === 'win32' ? '.exe' : ''));
    try { await access(path, constants.X_OK); return path; } catch { /* Next candidate. */ }
  }
  if (process.platform === 'win32' && name === 'qemu-system-x86_64') {
    const path = join(process.env.ProgramFiles || 'C:\\Program Files', 'qemu', name + '.exe');
    try { await access(path); return path; } catch { /* QEMU is not installed. */ }
  }
  return null;
}

export async function checkPreflight(directory, options, builder) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const disk = await statfs(directory);
  const free = Number(disk.bavail) * Number(disk.bsize);
  const checks = [
    { name: 'Περιβάλλον δημιουργίας', state: builder.available ? 'ready' : 'error', detail: builder.message },
    { name: 'Ελεύθερος χώρος', state: free >= 30 * 1024 ** 3 ? 'ready' : 'error', detail: `${(free / 1024 ** 3).toFixed(1)} GB διαθέσιμα στον φάκελο εξόδου. Απαιτούνται τουλάχιστον 30 GB.` },
    { name: 'Μνήμη', state: freemem() >= 2 * 1024 ** 3 ? 'ready' : 'warning', detail: `${(freemem() / 1024 ** 3).toFixed(1)} GB ελεύθερη RAM. Για μεγάλα desktop προτείνονται τουλάχιστον 4 GB.` },
    { name: 'Επιλογές ISO', state: 'ready', detail: `${options.distro} / ${options.desktop} · ${options.apps.length} πρόσθετα πακέτα · ${(options.files || []).length} προσωπικά αρχεία.` },
  ];
  const urls = { debian: 'https://deb.debian.org/debian/dists/trixie/Release', ubuntu: 'https://archive.ubuntu.com/ubuntu/dists/noble/Release', arch: 'https://archlinux.org/', fedora: 'https://fedoraproject.org/' };
  try {
    const response = await fetch(urls[options.distro], { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    checks.push({ name: 'Σύνδεση διανομής', state: response.ok ? 'ready' : 'warning', detail: response.ok ? 'Το αποθετήριο της διανομής ανταποκρίνεται.' : `Το αποθετήριο απάντησε με HTTP ${response.status}.` });
  } catch { checks.push({ name: 'Σύνδεση διανομής', state: 'error', detail: 'Δεν ήταν δυνατή η σύνδεση. Έλεγξε Internet, DNS ή proxy και δοκίμασε ξανά.' }); }
  return { checks, ready: !checks.some(check => check.state === 'error'), freeBytes: free };
}

export async function verifyIso(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size < 32774) throw new Error('Το ISO λείπει ή είναι ελλιπές.');
  const file = await open(path, 'r');
  try {
    const { buffer } = await file.read(Buffer.alloc(5), 0, 5, 32769);
    if (buffer.toString() !== 'CD001') throw new Error('Το αρχείο δεν είναι ISO 9660.');
  } finally { await file.close(); }
  return info;
}

export async function isoHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function removableDisks(tree) {
  const busy = disk => (disk.mountpoints || []).some(Boolean) || (disk.children || []).some(busy);
  return (tree.blockdevices || []).filter(disk => disk.type === 'disk' && [true, 1, '1'].includes(disk.rm)
    && ![true, 1, '1'].includes(disk.ro) && /^\/dev\/(?:sd[a-z]+|mmcblk\d+)$/.test(disk.path))
    .map(disk => ({ path: disk.path, model: String(disk.model || disk.name || '').trim(), serial: String(disk.serial || ''),
      bytes: Number(disk.size), identity: disk['maj:min'], mounted: busy(disk) }));
}

export async function listUsbDisks() {
  if (process.platform !== 'linux') return { available: false, disks: [], message: 'Η εγγραφή USB διατίθεται όταν ανοίγεις το Linux Studio στο Linux.' };
  const lsblk = await findTool('lsblk');
  const python = await findTool('python3');
  if (!lsblk || !python) return { available: false, disks: [], message: 'Χρειάζονται lsblk (util-linux) και Python 3 για εγγραφή USB.' };
  const data = await runAppCommand(lsblk, ['--json', '--bytes', '--output', 'NAME,PATH,TYPE,RM,RO,SIZE,MODEL,SERIAL,MOUNTPOINTS,MAJ:MIN'], { timeout: 15_000 });
  return { available: true, disks: removableDisks(JSON.parse(data)), message: 'Εμφανίζονται μόνο αφαιρούμενοι δίσκοι. Κάνε unmount τα partitions του USB από τον διαχειριστή αρχείων πριν την εγγραφή.' };
}

// Revalidates in the privileged process, then opens the block device exclusively.
// A changed device, a mounted filesystem, a non-removable disk or a regular file is rejected.
export const usbWriter = String.raw`
import os, sys, stat, json, subprocess, hashlib
source, target, identity, size, expected, lsblk, serial = sys.argv[1:]
size = int(size)
def fail(message): raise RuntimeError(message)
def busy(node): return any(node.get('mountpoints') or []) or any(busy(c) for c in node.get('children', []))
data = json.loads(subprocess.check_output([lsblk, '--json', '--bytes', '--output', 'NAME,PATH,TYPE,RM,RO,SIZE,MOUNTPOINTS,MAJ:MIN,SERIAL']))
disk = next((d for d in data['blockdevices'] if d.get('path') == target), None)
if not disk or disk.get('type') != 'disk' or not disk.get('rm') or disk.get('ro') or busy(disk): fail('USB is not removable, writable and unmounted')
if disk['maj:min'] != identity or int(disk['size']) != size or (disk.get('serial') or '') != serial: fail('USB device changed; select it again')
info = os.lstat(target)
if not stat.S_ISBLK(info.st_mode): fail('Target must be a real block device')
with open(source, 'rb') as image:
    image.seek(32769)
    if image.read(5) != b'CD001': fail('Invalid ISO')
    image.seek(0)
    length = os.fstat(image.fileno()).st_size
    if length > size: fail('ISO is larger than USB')
    digest = hashlib.file_digest(image, 'sha256').hexdigest()
    if digest != expected: fail('ISO changed before writing')
    image.seek(0)
    fd = os.open(target, os.O_RDWR | os.O_EXCL | os.O_NOFOLLOW)
    with os.fdopen(fd, 'r+b', buffering=0) as output:
        actual = os.fstat(output.fileno())
        if actual.st_rdev != info.st_rdev: fail('USB identity changed')
        written = 0
        while True:
            block = image.read(4 * 1024 * 1024)
            if not block: break
            view = memoryview(block)
            while view:
                count = output.write(view)
                if not count: fail('USB write failed')
                view = view[count:]
            written += len(block)
            print('WRITE %d %d' % (written, length), flush=True)
        output.flush()
        os.fsync(output.fileno())
        output.seek(0)
        check = hashlib.sha256()
        remaining = length
        while remaining:
            block = output.read(min(4 * 1024 * 1024, remaining))
            if not block: fail('USB verification read failed')
            check.update(block)
            remaining -= len(block)
            print('VERIFY %d %d' % (length - remaining, length), flush=True)
        if check.hexdigest() != expected: fail('USB SHA-256 verification failed')
print('USB_VERIFIED', flush=True)
`;

export async function writeUsb(source, request, log) {
  const { disks, available } = await listUsbDisks();
  const disk = disks.find(disk => disk.path === request.device && disk.identity === request.identity && disk.bytes === request.bytes && disk.serial === request.serial);
  if (!available || !disk || disk.mounted || request.confirmation !== `ΔΙΑΓΡΑΦΗ ${disk.path}`) throw new Error('Επίλεξε ξανά αφαιρούμενο USB χωρίς mounted partitions και πληκτρολόγησε την επιβεβαίωση διαγραφής.');
  const image = await verifyIso(source);
  if (image.size > disk.bytes) throw new Error('Το ISO δεν χωράει στο επιλεγμένο USB.');
  log('Έλεγχος SHA-256 του ISO…\n');
  const hash = await isoHash(source);
  const python = await findTool('python3');
  const lsblk = await findTool('lsblk');
  const args = ['-c', usbWriter, source, disk.path, disk.identity, String(disk.bytes), hash, lsblk, disk.serial];
  if (process.getuid() === 0) await runAppCommand(python, args, { log });
  else if (await findTool('pkexec')) await runAppCommand(await findTool('pkexec'), [python, ...args], { log });
  else if (await findTool('sudo')) await runAppCommand(await findTool('sudo'), ['-n', python, ...args], { log });
  else throw new Error('Για εγγραφή USB χρειάζεται PolicyKit ή επιβεβαιωμένο sudo.');
}

export function createVmService() {
  let child, state = { state: 'idle', log: '' };
  async function status() { return { ...state, available: Boolean(await findTool('qemu-system-x86_64')), maxMemory: Math.max(512, Math.min(8192, Math.floor(freemem() / 1024 ** 2 * .75))) }; }
  async function start(path, memory = 2048) {
    if (child) throw new Error('Υπάρχει ήδη ανοιχτή δοκιμή ISO.');
    const qemu = await findTool('qemu-system-x86_64');
    if (!qemu) throw new Error('Χρειάζεται QEMU: εγκατάστησε το qemu-system-x86 στο Linux ή το QEMU για Windows.');
    if (!Number.isInteger(memory) || memory < 512 || memory > (await status()).maxMemory) throw new Error('Διάλεξε μνήμη μέσα στα διαθέσιμα όρια.');
    await verifyIso(path);
    if (child) throw new Error('Υπάρχει ήδη ανοιχτή δοκιμή ISO.');
    state = { state: 'starting', log: '', memory };
    const processHandle = spawn(qemu, ['-no-user-config', '-m', String(memory), '-boot', 'd', '-cdrom', path, '-snapshot', '-nic', 'user,model=e1000', '-no-reboot'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    child = processHandle;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { state.log = (state.log + data).slice(-8192); });
    child.once('error', error => { state.state = 'failed'; state.log += error.message; if (child === processHandle) child = null; });
    child.once('exit', code => { state.state = code === 0 || state.state === 'stopping' ? 'stopped' : 'failed'; if (child === processHandle) child = null; });
    await new Promise(resolve => setTimeout(resolve, 1200));
    if (state.state === 'failed') throw new Error(state.log || 'Το QEMU δεν ξεκίνησε. Χρειάζεται γραφική συνεδρία.');
    if (child) state.state = 'running';
    return status();
  }
  function stop() { if (child) { state.state = 'stopping'; child.kill(); } }
  return { status, start, stop, active: () => Boolean(child) };
}
