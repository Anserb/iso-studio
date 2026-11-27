import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeRecipe } from './recipe.mjs';

export function createStudioStore(directory) {
  let chain = Promise.resolve();
  const file = join(directory, 'studio.json');
  async function pack(options) {
    if (!options?.files?.length) return options;
    const files = [];
    await mkdir(join(directory, 'assets'), { recursive: true, mode: 0o700 });
    for (const item of options.files) {
      const bytes = Buffer.from(item.content, 'base64');
      const blob = createHash('sha256').update(bytes).digest('hex');
      await writeFile(join(directory, 'assets', blob), bytes, { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      files.push({ name: item.name, destination: item.destination || 'LinuxStudio', blob, bytes: bytes.length });
    }
    return { ...options, files };
  }
  async function unpack(options) {
    if (!options?.files?.length) return options;
    const files = await Promise.all(options.files.map(async item => {
      if (!/^[a-f\d]{64}$/.test(item.blob)) throw new Error('Μη έγκυρο αποθηκευμένο αρχείο.');
      const bytes = await readFile(join(directory, 'assets', item.blob));
      if (createHash('sha256').update(bytes).digest('hex') !== item.blob) throw new Error('Το αποθηκευμένο αρχείο έχει αλλοιωθεί.');
      return { name: item.name, destination: item.destination || 'LinuxStudio', content: bytes.toString('base64') };
    }));
    return { ...options, files };
  }
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { profiles: [], history: [] }; throw error; }
  }
  function change(update) {
    const work = chain.then(async () => {
      const data = await read();
      const result = update(data);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = join(directory, `studio-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
      return result;
    });
    chain = work.catch(() => {});
    return work;
  }
  return {
    async list() { await chain; return read(); },
    async profile(id) { const data = await read(); const profile = data.profiles.find(item => item.id === id); return profile && { ...profile, options: await unpack(profile.options) }; },
    async history(id) { const data = await read(); const entry = data.history.find(item => item.id === id); return entry && { ...entry, options: await unpack(entry.options) }; },
    async saveProfile(label, options, id) {
      makeRecipe(options);
      if (typeof label !== 'string' || !label.trim() || label.length > 80) throw new Error('Δώσε όνομα προφίλ έως 80 χαρακτήρες.');
      const packed = await pack(options);
      return change(data => {
        const previous = id && data.profiles.find(profile => profile.id === id);
        if (id && !previous) throw new Error('Το προφίλ δεν βρέθηκε.');
        if (!previous && data.profiles.length >= 50) throw new Error('Μπορείς να αποθηκεύσεις έως 50 προφίλ.');
        const profile = { id: previous?.id || randomUUID(), label: label.trim(), options: packed, updatedAt: new Date().toISOString() };
        data.profiles = [profile, ...data.profiles.filter(item => item.id !== profile.id)];
        return profile;
      });
    },
    deleteProfile(id) { return change(data => { data.profiles = data.profiles.filter(profile => profile.id !== id); }); },
    async record(entry) {
      const packed = entry.options ? await pack(entry.options) : undefined;
      return change(data => {
        data.history = [{ ...entry, ...(packed ? { options: packed } : {}), updatedAt: new Date().toISOString() }, ...data.history.filter(item => item.id !== entry.id)].slice(0, 100);
      });
    },
  };
}
