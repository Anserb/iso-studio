import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

export const version = '0.3.0';
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

export function createUpdater({ directory, installed, request = fetch, current = version, platform = process.platform }) {
  let status = 'idle';
  let candidate;
  let cached;

  async function download(update) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stage = await mkdtemp(join(directory, 'release-'));
    const path = join(stage, update.name);
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
      await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
      if (bytes !== update.size || hash.digest('hex') !== update.hash) throw new Error('Unexpected update digest.');
      return { stage, path };
    } catch (error) {
      await rm(stage, { recursive: true, force: true });
      throw error;
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
    try {
      if ((await stat(cached.path)).size === candidate.size && await digest(cached.path) === candidate.hash) {
        return { ...candidate, path: cached.path };
      }
    } catch { /* Discard the unavailable package. */ }
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
      if (platform === 'win32') {
        const setup = spawn(update.path, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/RELAUNCH=1'],
          { detached: true, stdio: 'ignore', windowsHide: true });
        await new Promise((resolve, reject) => { setup.once('spawn', resolve); setup.once('error', reject); });
        setup.unref();
      } else {
        await run('tar', ['-xzf', update.path, '-C', cached.stage, '--no-same-owner', '--no-same-permissions']);
        const installer = join(cached.stage, 'LinuxStudio', 'Linux', 'install.mjs');
        await run(process.execPath, [installer], { env: { ...process.env, NODE_OPTIONS: '' } });
        await rm(cached.stage, { recursive: true, force: true });
      }
      status = 'installed';
      return true;
    } catch {
      status = 'ready';
      throw new Error('Η εγκατάσταση της ενημέρωσης απέτυχε. Δοκίμασε ξανά.');
    }
  }

  return {
    check, verifiedUpdate, install,
    info: () => ({ current, status, version: candidate?.version, canInstall: installed, restartAutomatic: platform === 'win32' && installed }),
  };
}
