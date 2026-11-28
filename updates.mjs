import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

export const version = '0.9.3';
const repository = 'Anserb/iso-studio';
const feed = `https://api.github.com/repos/${repository}/releases/latest`;
const run = promisify(execFile);

function versionParts(tag) {
  if (!/^v?\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(tag)) return null;
  return tag.replace(/^v/, '').split('.').map(Number);
}

export function selectUpdate(release, current, platform) {
  const next = versionParts(release?.tag_name);
  const installed = versionParts(current);
  if (!next || !installed || release.draft || release.prerelease) return null;
  const index = next.findIndex((part, i) => part !== installed[i]);
  if (index < 0 || next[index] < installed[index]) return null;

  const name = platform === 'win32' ? 'LinuxStudioSetup.exe' : 'linux-studio-linux.tar.gz';
  const limit = (platform === 'win32' ? 150 : 25) * 1024 ** 2;
  const asset = Array.isArray(release.assets) && release.assets.find(item => item?.name === name);
  const url = `https://github.com/${repository}/releases/download/${release.tag_name}/${name}`;
  if (!asset || asset.browser_download_url !== url || !/^sha256:[a-f\d]{64}$/i.test(asset.digest)
    || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > limit) return null;

  return { version: next.join('.'), name, url, size: asset.size, hash: asset.digest.slice(7).toLowerCase() };
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function matches(path, update) {
  try {
    return (await stat(path)).size === update.size && await digest(path) === update.hash;
  } catch {
    return false;
  }
}

export function createUpdater({ directory, installed, request = fetch, current = version, platform = process.platform }) {
  let status = 'idle';
  let candidate;
  let cached;
  let completedVersion;
  const noticePath = join(directory, 'last-install.json');
  const noticeReady = readFile(noticePath, 'utf8').then(text => {
    const notice = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (notice.version === current) completedVersion = current;
  }).catch(() => {});

  async function acknowledge() {
    await noticeReady;
    const notice = await readFile(noticePath, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, ''))).catch(() => null);
    if (notice?.version === current) await rm(noticePath, { force: true });
    completedVersion = undefined;
  }

  async function download(update) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stage = join(directory, `release-${update.version}-${update.hash}`);
    const path = join(stage, update.name);
    if (await matches(path, update)) return { stage, path };
    const temporary = await mkdtemp(join(directory, 'download-'));
    const partial = join(temporary, update.name);
    try {
      const response = await request(update.url, { signal: AbortSignal.timeout(180_000) });
      const destination = new URL(response.url || update.url);
      if (!response.ok || destination.protocol !== 'https:'
        || !['github.com', 'release-assets.githubusercontent.com'].includes(destination.hostname)) {
        await response.body?.cancel();
        throw new Error('Unexpected release download response.');
      }
      let bytes = 0;
      const hash = createHash('sha256');
      const verify = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > update.size) return callback(new Error('Unexpected download size.'));
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
      if (bytes !== update.size || hash.digest('hex') !== update.hash) throw new Error('Unexpected update digest.');
      await mkdir(stage, { recursive: true, mode: 0o700 });
      await rename(partial, path);
      return { stage, path };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  async function check() {
    if (['checking', 'downloading', 'installing', 'installed', 'ready'].includes(status)) return;
    status = 'checking';
    candidate = undefined;
    try {
      const response = await request(feed, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `LinuxStudio/${current}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error('The release feed is unavailable.');
      const release = await response.json();
      candidate = selectUpdate(release, current, platform);
      if (!candidate) {
        status = 'current';
        return;
      }
      status = 'downloading';
      cached = await download(candidate);
      status = 'ready';
    } catch {
      status = 'unavailable';
    }
  }

  async function verifiedUpdate() {
    if (status !== 'ready' || !cached) return null;
    if (await matches(cached.path, candidate)) return { ...candidate, path: cached.path };
    await rm(cached.stage, { recursive: true, force: true });
    cached = undefined;
    status = 'unavailable';
    return null;
  }

  async function install() {
    if (!installed) return false;
    const update = await verifiedUpdate();
    if (!update || status !== 'ready') return false;
    status = 'installing';
    try {
      const temporary = join(directory, `last-install-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify({ version: update.version }), { flag: 'wx', mode: 0o600 });
      await rename(temporary, noticePath);
      if (platform === 'win32') {
        const setup = spawn(update.path, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/RELAUNCH=1'],
          { detached: true, stdio: 'ignore', windowsHide: true });
        await new Promise((resolve, reject) => { setup.once('spawn', resolve); setup.once('error', reject); });
        setup.unref();
      } else {
        const unpack = await mkdtemp(join(directory, 'install-'));
        try {
          await run('tar', ['-xzf', update.path, '-C', unpack, '--no-same-owner', '--no-same-permissions']);
          const installer = join(unpack, 'LinuxStudio', 'Linux', 'install.mjs');
          await run(process.execPath, [installer], { env: { ...process.env, NODE_OPTIONS: '' } });
        } finally {
          await rm(unpack, { recursive: true, force: true });
        }
      }
      status = 'installed';
      return true;
    } catch {
      await rm(noticePath, { force: true }).catch(() => {});
      status = 'ready';
      throw new Error('Η εγκατάσταση της ενημέρωσης απέτυχε. Δοκίμασε ξανά.');
    }
  }

  return {
    check, verifiedUpdate, install, acknowledge, ready: noticeReady,
    info: () => ({ current, status, version: candidate?.version, canInstall: installed, completedVersion, restartAutomatic: platform === 'win32' && installed }),
  };
}
