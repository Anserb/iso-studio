import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

const files = [
  'app.mjs', 'catalog.mjs', 'index.html', 'other-builders.mjs', 'recipe.mjs',
  'server.mjs', 'style.css', 'Linux/launch.mjs', 'LICENSE',
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
const target = join(data, 'linux-studio', 'app');
const launcher = join(home, '.local', 'bin', 'linux-studio');
const desktop = join(data, 'applications', 'uk.pvgaming.linuxstudio.desktop');
const launchScript = join(target, 'Linux', 'launch.mjs');
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const desktopQuote = (value) => '"' + value
  .replaceAll('\\', '\\\\')
  .replace(/["$`]/g, '\\$&')
  .replaceAll('\\', '\\\\')
  .replaceAll('%', '%%') + '"';

try {
  for (const file of files) {
    const destination = join(target, file);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = destination + '.' + process.pid + '.tmp';
    await copyFile(new URL(file, app), temporary);
    await rename(temporary, destination);
  }

  await mkdir(dirname(launcher), { recursive: true });
  await mkdir(dirname(desktop), { recursive: true });
  await writeFile(launcher + '.new', `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(launchScript)} "$@"\n`, { mode: 0o755, flag: 'w' });
  await rename(launcher + '.new', launcher);
  await writeFile(desktop, `[Desktop Entry]
Type=Application
Name=Linux Studio
Comment=Configure and build a Linux Live ISO
Exec=${desktopQuote(launcher)}
Icon=utilities-terminal
Terminal=true
Categories=Utility;
`);
  console.log(`Εγκαταστάθηκε. Άνοιξε το Linux Studio από το μενού ή εκτέλεσε:\n${shellQuote(launcher)}`);
} catch (error) {
  console.error(`Η εγκατάσταση απέτυχε: ${error.message}`);
  process.exitCode = 1;
}
