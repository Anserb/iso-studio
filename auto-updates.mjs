import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createAutoUpdates({ file, updater, busy, install, fetchRelease = fetch }) {
  let enabled = true, lastCheck, error, checking = false;
  async function load() {
    try { enabled = JSON.parse(await readFile(file, 'utf8')).enabled === true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function save(value) {
    if (typeof value !== 'boolean') throw new Error('Μη έγκυρη ρύθμιση ενημερώσεων.');
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ enabled: value }), { flag: 'wx', mode: 0o600 });
    await rename(temporary, file);
    enabled = value;
  }
  async function tick() {
    if (checking) return;
    checking = true;
    try {
      // A redirect check avoids spending GitHub's anonymous API quota every minute.
      const response = await fetchRelease('https://github.com/Anserb/iso-studio/releases/latest', { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(12_000) });
      const tag = /\/releases\/tag\/v(\d+\.\d+\.\d+)$/.exec(response.headers.get('location') || '')?.[1];
      if (!tag) throw new Error('Δεν ήταν δυνατός ο έλεγχος νέας έκδοσης.');
      lastCheck = new Date().toISOString(); error = undefined;
      const info = updater.info();
      const nextParts = tag.split('.').map(Number), currentParts = info.current.split('.').map(Number);
      const difference = nextParts.findIndex((value, i) => value !== currentParts[i]);
      if (difference >= 0 && nextParts[difference] > currentParts[difference] && !['checking', 'downloading', 'installing'].includes(info.status) && info.version !== tag) await updater.check();
      const next = updater.info();
      if (enabled && next.canInstall && next.status === 'ready' && !busy()) await install();
    } catch (failure) { error = failure.message; }
    finally { checking = false; }
  }
  return { load, save, tick, info: () => ({ enabled, intervalSeconds: 60, lastCheck, error }) };
}
