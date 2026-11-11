import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionWatcher, readDeployedRelease, trustedRelease } from './versionNotice.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const valid = (sha) => ({
  schema: 1, application: 'snooker-of-matthias', environment: 'staging',
  authentication: { provider: 'shadowops-id', audience: 'snooker', required: true },
  source_sha: sha,
});

test('only audited app and isolated Identity metadata can set a version', () => {
  assert.equal(trustedRelease(valid(A)), true);
  for (const edit of [
    { schema: 2 }, { application: 'other-app' },
    { environment: 'production' }, { source_sha: 'untrusted' },
    { authentication: { ...valid(A).authentication, audience: 'football' } },
    { authentication: { ...valid(A).authentication, required: false } },
  ]) assert.equal(trustedRelease({ ...valid(A), ...edit }), false);
  assert.equal(trustedRelease(null), false);
});

test('fetch stays authenticated, same origin and cache-bypassing', async () => {
  let args;
  const fetched = await readDeployedRelease(async (...value) => {
    args = value;
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
      json: async () => valid(A),
    };
  });
  assert.equal(fetched, A);
  assert.equal(args[0], '/release.json');
  assert.equal(args[1].credentials, 'same-origin');
  assert.equal(args[1].cache, 'no-store');
  assert.equal(args[1].headers.Accept, 'application/json');
});

test('local dev 404, Identity HTML and bad release metadata are ignored', async () => {
  const response = (ok, type, json) => ({
    ok, headers: new Headers({ 'content-type': type }), json: async () => json,
  });
  assert.equal(await readDeployedRelease(async () => response(false, 'application/json', valid(A))), null);
  assert.equal(await readDeployedRelease(async () => response(true, 'text/html', valid(A))), null);
  assert.equal(await readDeployedRelease(async () => response(true, 'application/json', valid('bad'))), null);
});

test('first release is baseline, then notify once per published SHA', async () => {
  let sha = A;
  const notified = [];
  let timer;
  const watcher = createVersionWatcher({
    readRelease: async () => sha,
    onAvailable: () => notified.push(sha),
    repeat: (fn, ms) => { assert.equal(ms, 90_000); timer = fn; return 7; },
    cancel: (id) => assert.equal(id, 7),
  });
  watcher.start();
  await watcher.check(); // start's immediate check may already be in flight
  assert.deepEqual(notified, [], 'loading the current build does not prompt');
  sha = B;
  await timer();
  assert.deepEqual(notified, [B]);
  await timer();
  assert.deepEqual(notified, [B], 'same release does not nag');
  sha = C;
  await timer();
  assert.deepEqual(notified, [B, C], 'newer release can prompt again');
  watcher.stop();
  await timer();
  assert.deepEqual(notified, [B, C], 'stopped watcher is inert');
});

test('no polling while hidden and denied/failed reads never show a banner', async () => {
  let hidden = false;
  let sha = A;
  let requests = 0;
  let notices = 0;
  const watcher = createVersionWatcher({
    readRelease: async () => { requests++; if (sha === null) throw Error('identity unavailable'); return sha; },
    isVisible: () => !hidden,
    onAvailable: () => notices++,
    repeat: () => 9, cancel: () => {},
  });
  watcher.start();
  await watcher.check();
  hidden = true;
  sha = B;
  const before = requests;
  await watcher.check();
  assert.equal(requests, before);
  hidden = false;
  sha = null;
  await watcher.check();
  assert.equal(notices, 0);
  sha = B;
  await watcher.check();
  assert.equal(notices, 1);
  watcher.stop();
});
