import { copyFile, lstat, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

const files = [
  'app.mjs', 'catalog.mjs', 'index.html', 'other-builders.mjs', 'recipe.mjs',
  'server.mjs', 'style.css', 'updates.mjs', 'wsl-build.mjs', 'desktop-appearance.mjs', 'linux-apps.mjs', 'app-library.mjs', 'app-installer.mjs',
  'studio-customization.mjs', 'studio-ui.mjs', 'studio-store.mjs', 'studio-tools.mjs', 'auto-updates.mjs', 'assets/linux-studio-logo.svg', 'Linux/launch.mjs', 'LICENSE',
];
const app = new URL('../', import.meta.url);

if (process.platform !== 'linux' || process.getuid() === 0) {
  console.error('Εκτέλεσε τον installer σε Linux ως κανονικός χρήστης, χωρίς sudo.');
  process.exit(1);
}
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Απαιτείται Node.js 22 ή νεότερο.');
  process.exit(1);
}

const home = homedir();
const data = isAbsolute(process.env.XDG_DATA_HOME ?? '') ? process.env.XDG_DATA_HOME : join(home, '.local', 'share');
const location = join(data, 'linux-studio');
const target = join(location, 'app');
const launcher = join(home, '.local', 'bin', 'linux-studio');
const desktop = join(data, 'applications', 'uk.pvgaming.linuxstudio.desktop');
const launchScript = join(target, 'Linux', 'launch.mjs');
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const desktopQuote = (value) => '"' + value
  .replaceAll('\\', '\\\\')
  .replace(/["$`]/g, '\\$&')
  .replaceAll('\\', '\\\\')
  .replaceAll('%', '%%') + '"';

let staged;
let nextLink;
let published = false;
try {
  await mkdir(location, { recursive: true, mode: 0o700 });
  staged = await mkdtemp(join(location, 'release-'));
  for (const file of files) {
    const destination = join(staged, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(new URL(file, app), destination);
  }

  nextLink = join(location, '.next-' + basename(staged));
  await symlink(basename(staged), nextLink, 'dir');
  const previous = await lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  // Older packages installed a regular app directory. Keep it available if migration fails.
  const legacy = previous?.isDirectory() ? join(location, 'legacy-' + basename(staged)) : null;
  if (legacy) await rename(target, legacy);
  try {
    await rename(nextLink, target);
    published = true;
  } catch (error) {
    if (legacy) await rename(legacy, target);
    throw error;
  }

  await mkdir(dirname(launcher), { recursive: true });
  await mkdir(dirname(desktop), { recursive: true });
  const launcherTemp = launcher + '.' + process.pid + '.tmp';
  await writeFile(launcherTemp, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(launchScript)} "$@"\n`, { mode: 0o755, flag: 'wx' });
  await rename(launcherTemp, launcher);
  await writeFile(desktop, `[Desktop Entry]
Type=Application
Name=Linux Studio
Comment=Configure and build a Linux Live ISO
Exec=${desktopQuote(launcher)}
Icon=${join(target, 'assets', 'linux-studio-logo.svg')}
Terminal=true
Categories=Utility;
`);
  console.log(`Εγκαταστάθηκε. Άνοιξε το Linux Studio από το μενού ή εκτέλεσε:\n${shellQuote(launcher)}`);
} catch (error) {
  console.error(`Η εγκατάσταση απέτυχε: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (nextLink && !published) await rm(nextLink, { force: true });
  if (staged && !published) await rm(staged, { recursive: true, force: true });
}
