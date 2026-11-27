import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { createAutoUpdates } from '../auto-updates.mjs';
import { createAppInstaller } from '../app-installer.mjs';
import { catalog, choicesFor } from '../catalog.mjs';
import { appearanceFiles } from '../desktop-appearance.mjs';
import { makeRecipe } from '../recipe.mjs';
import { createStudioStore } from '../studio-store.mjs';
import { validateExtras } from '../studio-customization.mjs';
import { removableDisks } from '../studio-tools.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=';
const base = { distro: 'debian', kernel: 'linux-image-amd64', desktop: 'xfce', language: 'el_GR.UTF-8', keyboard: 'us,gr', name: 'my-linux', firmware: true, installer: false, apps: [], appearance: 'nord' };
const custom = { font: 'DejaVu Sans Mono', icons: 'Papirus-Dark', cursor: 'Adwaita', panel: 'top', accent: '#ee44aa', wallpaper: 'wallpaper.png' };
const extras = { customization: custom, files: [{ name: 'wallpaper.png', destination: 'Pictures', content: png }, { name: 'Welcome.txt', destination: 'Documents', content: Buffer.from('Hello Linux!').toString('base64') }] };

test('personal file names, destination folders and base64 cannot inject paths or commands', () => {
  for (const file of [
    { name: '../../.bashrc', content: 'AA==' }, { name: '$(id).txt', content: 'AA==' },
    { name: 'safe.txt', content: 'AA==', destination: '../../etc' }, { name: 'file.txt', content: 'evil\nEOF' },
  ]) assert.throws(() => validateExtras({ files: [file] }));
  assert.throws(() => validateExtras({ files: Array(31).fill({ name: 'x', content: '' }) }));
  assert.throws(() => validateExtras({ ...base, files: [], customization: custom }));
  assert.throws(() => validateExtras({ ...base, appearance: 'default', ...extras }));
  assert.throws(() => validateExtras({ ...base, ...extras, customization: { ...custom, accent: "';touch /tmp/x" } }));
  assert.throws(() => validateExtras({ ...base, files: [{ name: 'wallpaper.png', content: 'aGVsbG8=' }], customization: custom }));
});

test('appearance customization and personal files reach every supported graphical builder', () => {
  let count = 0;
  for (const distro of catalog.distros) for (const desktop of choicesFor(distro).desktops.filter(item => item.id !== 'standard')) {
    const recipe = makeRecipe({ ...base, distro: distro.id, kernel: distro.kernels[0].id, desktop: desktop.id, firmware: Boolean(distro.firmware), ...extras });
    assert.ok(recipe.script.includes('/etc/skel/Pictures/wallpaper.png'));
    assert.ok(recipe.script.includes('/etc/skel/Documents/Welcome.txt'));
    assert.ok(recipe.script.includes('/usr/share/backgrounds/linux-studio-wallpaper'));
    assert.ok(recipe.script.includes('#ee44aa') || recipe.script.includes('238,68,170'));
    assert.ok(recipe.script.includes('DejaVu Sans Mono'));
    count++;
  }
  assert.equal(count, 10);
});

test('Xfce, GNOME and Plasma apply requested wallpaper, icons, fonts and panel position', () => {
  const xfce = appearanceFiles('xfce', 'nord', custom);
  assert.match(xfce['/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml'], /p=6;/);
  assert.match(xfce['/usr/local/share/linux-studio/initial-background.sh'], /last-image|\$path/);
  assert.match(xfce['/usr/local/share/linux-studio/initial-background.sh'], /linux-studio-wallpaper/);
  const gnome = appearanceFiles('gnome', 'nord', custom);
  assert.match(gnome['/usr/share/glib-2.0/schemas/90_linux-studio.gschema.override'], /font-name='DejaVu Sans Mono 10'/);
  assert.match(gnome['/usr/local/share/linux-studio/initial-gnome.sh'], /panel-positions '\{"0":"TOP"\}'/);
  const plasma = appearanceFiles('kde', 'nord', custom);
  assert.match(plasma['/etc/skel/.config/plasma-org.kde.plasma.desktop-appletsrc'], /location=3/);
  assert.match(plasma['/etc/skel/.config/plasma-org.kde.plasma.desktop-appletsrc'], /wallpaperplugin=org.kde.image/);
});

test('profiles persist concurrently without losing entries and deduplicate file content', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'studio-profiles-'));
  const store = createStudioStore(folder);
  const options = { ...base, ...extras };
  const profiles = await Promise.all(Array.from({ length: 5 }, (_, index) => store.saveProfile(`Profile ${index}`, options)));
  assert.equal((await store.list()).profiles.length, 5);
  assert.equal((await readdir(join(folder, 'assets'))).length, 2);
  assert.equal((await store.profile(profiles[0].id)).options.files[0].content, png);
  assert.equal((await store.profile(profiles[0].id)).options.files[0].destination, 'Pictures');
  const saved = await readFile(join(folder, 'studio.json'), 'utf8');
  assert.equal(saved.includes(png), false);
  await store.deleteProfile(profiles[0].id);
  assert.equal((await createStudioStore(folder).list()).profiles.length, 4);
  await assert.rejects(store.saveProfile('Invalid', { ...base, name: '../bad' }));
});

test('history survives process restarts and restores the original configuration', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'studio-history-'));
  await createStudioStore(folder).record({ id: 'test', kind: 'build', state: 'ready', options: { ...base, ...extras }, log: 'ISO ready', filename: 'my-linux-debian-amd64.iso' });
  const entry = await createStudioStore(folder).history('test');
  assert.equal(entry.log, 'ISO ready');
  assert.equal(entry.options.files[1].content, extras.files[1].content);
});

test('USB candidates exclude internal, read-only, and non-disk targets; mounted children are marked blocked', () => {
  const disk = { name: 'sdb', path: '/dev/sdb', type: 'disk', rm: true, ro: false, size: 1000, 'maj:min': '8:16', mountpoints: [], serial: 'usb' };
  const result = removableDisks({ blockdevices: [disk, { ...disk, path: '/dev/sda', rm: false }, { ...disk, path: '/dev/sdc', ro: true }, { ...disk, path: '/tmp/file' }, { ...disk, path: '/dev/sdd', children: [{ mountpoints: ['/'] }] }] });
  assert.equal(result.length, 2);
  assert.equal(result[0].mounted, false);
  assert.equal(result[1].mounted, true);
  assert.equal(result[0].identity, '8:16');
});

function autoFixture(folder, { occupied = false, current = '0.7.0', tag = '0.8.0', ready = false } = {}) {
  let downloads = 0, installs = 0, state = ready ? 'ready' : 'current';
  const updater = { info: () => ({ current, version: state === 'ready' ? tag : undefined, status: state, canInstall: true }), check: async () => { downloads++; state = 'ready'; } };
  const service = createAutoUpdates({ file: join(folder, 'auto.json'), updater, busy: () => occupied,
    install: async () => { installs++; state = 'installed'; }, fetchRelease: async () => new Response(null, { status: 302, headers: { location: `https://github.com/Anserb/iso-studio/releases/tag/v${tag}` } }) });
  return { service, counts: () => ({ downloads, installs }) };
}

test('automatic updates check every minute, download a new release, and install only while idle', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'studio-updates-'));
  const { service, counts } = autoFixture(folder);
  await service.load(); await service.tick();
  assert.equal(service.info().intervalSeconds, 60);
  assert.ok(service.info().lastCheck);
  assert.deepEqual(counts(), { downloads: 1, installs: 1 });
  const blocked = autoFixture(folder, { occupied: true });
  await blocked.service.tick(); assert.deepEqual(blocked.counts(), { downloads: 1, installs: 0 });
});

test('automatic installation opt-out persists and older releases do not trigger downloads', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'studio-update-options-'));
  const first = autoFixture(folder); await first.service.save(false);
  const next = autoFixture(folder); await next.service.load(); await next.service.tick();
  assert.equal(next.service.info().enabled, false);
  assert.deepEqual(next.counts(), { downloads: 1, installs: 0 });
  const older = autoFixture(folder, { tag: '0.6.0' }); await older.service.tick();
  assert.deepEqual(older.counts(), { downloads: 0, installs: 0 });
});

test('application management validates installed scope and preserves data on uninstall', async () => {
  const commands = [], installed = new Set(['org.gnome.meld']);
  const service = createAppInstaller({ platform: 'linux', uid: () => 1000, find: async () => '/usr/bin/flatpak',
    run: async (command, args) => {
      commands.push(args);
      if (args[0] === 'list') return [...installed].map(id => `${id}\tMeld\tuser`).join('\n');
      if (args[0] === 'uninstall') installed.delete(args.at(-1));
      return '';
    },
  });
  assert.deepEqual(await service.inventory(), [{ id: 'org.gnome.meld', name: 'Meld', scope: 'user' }]);
  const id = service.startAction('uninstall', [{ id: 'org.gnome.meld', scope: 'user' }]);
  for (let i = 0; i < 100 && service.job(id).state === 'running'; i++) await setTimeout(5);
  assert.equal(service.job(id).state, 'ready');
  assert.ok(commands.some(args => args[0] === 'uninstall' && args.includes('--user')));
  assert.equal(commands.some(args => args.includes('--delete-data')), false);
  const invalid = service.startAction('update', [{ id: 'org.gnome.meld', scope: 'system' }]);
  for (let i = 0; i < 100 && service.job(invalid).state === 'running'; i++) await setTimeout(5);
  assert.equal(service.job(invalid).state, 'failed');
  assert.throws(() => service.startAction('uninstall', [{ id: '--command=sh', scope: 'user' }]));
});
