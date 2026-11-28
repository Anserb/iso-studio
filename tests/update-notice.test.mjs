import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createUpdater } from '../updates.mjs';

test('completion is shown for the running installed version and acknowledged once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-completed-'));
  await writeFile(join(directory, 'last-install.json'), '\uFEFF' + JSON.stringify({ version: '1.2.3' }));
  const updater = createUpdater({ directory, installed: true, current: '1.2.3' });
  await updater.ready;
  assert.equal(updater.info().completedVersion, '1.2.3');
  await updater.acknowledge();
  assert.equal(updater.info().completedVersion, undefined);
  await assert.rejects(access(join(directory, 'last-install.json')));
});

test('pending updates and invalid notices are not reported as completed', async () => {
  for (const contents of ['{"version":"1.2.4"}', '{broken']) {
    const directory = await mkdtemp(join(tmpdir(), 'studio-pending-'));
    await writeFile(join(directory, 'last-install.json'), contents);
    const updater = createUpdater({ directory, installed: true, current: '1.2.3' });
    await updater.ready;
    assert.equal(updater.info().completedVersion, undefined);
  }
});

test('acknowledging an old notice preserves a newer installation receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-notice-race-'));
  await writeFile(join(directory, 'last-install.json'), JSON.stringify({ version: '1.2.3' }));
  const updater = createUpdater({ directory, installed: true, current: '1.2.3' });
  await updater.ready;
  await writeFile(join(directory, 'last-install.json'), JSON.stringify({ version: '1.2.4' }));
  await updater.acknowledge();
  await access(join(directory, 'last-install.json'));
});
