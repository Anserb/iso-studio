import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { createAppInstaller, parseOsRelease, setupPlan, validateApps } from '../app-installer.mjs';
import { linuxApps, appCollections } from '../linux-apps.mjs';

const first = 'org.libreoffice.LibreOffice';
const second = 'org.videolan.VLC';
const waitForJob = async (service, id) => {
  for (let i = 0; i < 100; i++) {
    if (service.job(id).state !== 'running') return service.job(id);
    await setTimeout(5);
  }
  throw new Error('Job did not complete');
};

function fixture({ flatpak = true, pkexec = true, failure, unconfirmed, remote } = {}) {
  let hasFlatpak = flatpak;
  const installed = new Set();
  const calls = [];
  const service = createAppInstaller({ platform: 'linux', uid: () => 1000,
    readOs: async () => 'ID=linuxmint\nID_LIKE="ubuntu debian"\nPRETTY_NAME="Linux Mint"\n',
    find: async name => (name === 'flatpak' ? hasFlatpak : ['apt-get', 'sudo'].includes(name) || (name === 'pkexec' && pkexec)) ? `/usr/bin/${name}` : null,
    run: async (command, args, options) => {
      calls.push([command, args]);
      options?.log?.('download progress\n');
      if (command.endsWith('/pkexec') || command.endsWith('/sudo')) { hasFlatpak = true; return ''; }
      if (args[0] === 'remotes') return remote ? `linux-studio-flathub\t${remote}\n` : '';
      if (args[0] === 'list') return [...installed].join('\n');
      if (args[0] === 'install') {
        await setTimeout(10);
        const id = args.at(-1);
        if (id === failure) throw new Error('download failed');
        if (id !== unconfirmed) installed.add(id);
      }
      return '';
    },
  });
  return { service, calls, installed };
}

test('catalog and collections contain only unique, valid application IDs', () => {
  assert.equal(linuxApps.length, 76);
  assert.equal(new Set(linuxApps.map(app => app.id)).size, linuxApps.length);
  for (const app of linuxApps) assert.match(app.id, /^[A-Za-z][\w-]*(?:\.[\w-]+){2,}$/);
  for (const collection of appCollections) assert.deepEqual(validateApps(collection.apps), collection.apps);
});

test('arbitrary commands, references and malformed selections are rejected', () => {
  for (const input of [null, [], first, [null], ['--command=sh'], [`${first};touch /tmp/pwn`], ['org.fake.App'], Array(77).fill(first)]) {
    assert.throws(() => validateApps(input));
  }
  assert.deepEqual(validateApps([first, first]), [first]);
});

test('setup uses the detected distro family and fixed Flatpak-only package arguments', () => {
  const binaries = { 'apt-get': '/apt-get', dnf: '/dnf', pacman: '/pacman', zypper: '/zypper' };
  assert.deepEqual(setupPlan(parseOsRelease('ID=mint\nID_LIKE="ubuntu debian"'), binaries), [['/apt-get', ['update']], ['/apt-get', ['install', '-y', 'flatpak']]]);
  assert.deepEqual(setupPlan({ ID: 'fedora' }, binaries), [['/dnf', ['install', '-y', 'flatpak']]]);
  assert.deepEqual(setupPlan({ ID: 'manjaro', ID_LIKE: 'arch' }, binaries), [['/pacman', ['-S', '--needed', '--noconfirm', 'flatpak']]]);
  assert.deepEqual(setupPlan({ ID: 'opensuse-tumbleweed' }, binaries), [['/zypper', ['--non-interactive', 'install', 'flatpak']]]);
  assert.equal(setupPlan({ ID: 'unknown' }, binaries), null);
});

test('Windows and root users cannot trigger installation', async () => {
  for (const opts of [{ platform: 'win32', uid: () => 1000 }, { platform: 'linux', uid: () => 0 }]) {
    const service = createAppInstaller({ ...opts, readOs: async () => '' });
    assert.throws(() => service.start([first]));
    assert.equal((await service.inspect()).canInstall, false);
  }
});

test('one queue installs only user-scoped apps and verifies their actual installed state', async () => {
  const { service, calls } = fixture();
  const id = service.start([first, second]);
  assert.throws(() => service.start([second]), /ήδη/);
  assert.equal(service.active(), true);
  const job = await waitForJob(service, id);
  assert.equal(job.state, 'ready');
  assert.deepEqual(job.results, [{ id: first, state: 'ready' }, { id: second, state: 'ready' }]);
  assert.equal(service.active(), false);
  const installs = calls.filter(([, args]) => args[0] === 'install');
  assert.equal(installs.length, 2);
  for (const [command, args] of installs) {
    assert.equal(command, '/usr/bin/flatpak');
    assert.deepEqual(args.slice(0, -1), ['install', '--user', '--noninteractive', '--assumeyes', '--app', 'linux-studio-flathub']);
  }
  assert.deepEqual((await service.inspect()).installed, [first, second]);
});

test('per-app download errors keep the rest of the batch running and support retry', async () => {
  const { service } = fixture({ failure: first });
  const job = await waitForJob(service, service.start([first, second]));
  assert.equal(job.state, 'failed');
  assert.equal(job.results[0].state, 'failed');
  assert.equal(job.results[1].state, 'ready');
  assert.equal((await waitForJob(service, service.start([second]))).state, 'ready');
});

test('successful exit without installed app does not report a successful installation', async () => {
  const { service } = fixture({ unconfirmed: first });
  const job = await waitForJob(service, service.start([first]));
  assert.equal(job.state, 'failed');
  assert.match(job.results[0].error, /δεν εμφανίζεται/);
});

test('missing runtime is bootstrapped via PolicyKit before user-scoped install', async () => {
  const { service, calls } = fixture({ flatpak: false });
  const status = await service.inspect();
  assert.equal(status.setupRequired, true);
  assert.equal(status.canInstall, true);
  const job = await waitForJob(service, service.start([first]));
  assert.equal(job.state, 'ready');
  assert.deepEqual(calls.slice(0, 2), [['/usr/bin/pkexec', ['/usr/bin/apt-get', 'update']], ['/usr/bin/pkexec', ['/usr/bin/apt-get', 'install', '-y', 'flatpak']]]);
  assert.equal((await service.inspect()).flatpak, true);
});

test('remote with an unexpected URL cannot supply packages under the Flathub name', async () => {
  const { service, calls } = fixture({ remote: 'https://example.invalid/repo/' });
  const job = await waitForJob(service, service.start([first]));
  assert.equal(job.state, 'failed');
  assert.match(job.error, /διαφορετική διεύθυνση/);
  assert.equal(calls.some(([, args]) => args[0] === 'install'), false);
});
