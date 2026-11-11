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

test('after short cookie expiry, renew through existing signed-in Identity flow once', async () => {
  const calls = [];
  const token = 'header.payload.signature';
  const response = (status, value) => ({
    ok: status >= 200 && status < 300, status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => value,
  });
  const fetcher = async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length === 1) return response(401, { error: 'authentication_required' });
    if (calls.length === 2) return response(200, { token });
    if (calls.length === 3) return response(200, { identity: 'snooker' });
    if (calls.length === 4) return response(200, valid(B));
    throw Error('unexpected extra request');
  };
  assert.equal(await readDeployedRelease(fetcher), B);
  assert.deepEqual(calls.map((c) => c.url), [
    '/release.json',
    'https://id-staging.shadowops.dpdns.org/api/identity/token',
    '/api/snooker/session',
    '/release.json',
  ]);
  assert.equal(calls[1].opts.credentials, 'include');
  assert.equal(calls[1].opts.method, 'POST');
  assert.equal(calls[1].opts.cache, 'no-store');
  assert.equal(calls[2].opts.credentials, 'same-origin');
  assert.equal(calls[2].opts.method, 'POST');
  assert.equal(calls[2].opts.body, JSON.stringify({ token }));
  assert.equal(calls[3].opts.credentials, 'same-origin');
});

test('logged-out or revoked Identity cannot renew, and no manifest is exposed', async () => {
  const calls = [];
  const response = (status, value = {}) => ({
    ok: status >= 200 && status < 300, status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => value,
  });
  assert.equal(await readDeployedRelease(async (url, options) => {
    calls.push([url, options]);
    return calls.length === 1 ? response(401) : response(401);
  }), null);
  assert.equal(calls.length, 2, 'no session POST when IdP rejects');
  assert.equal(calls[1][0], 'https://id-staging.shadowops.dpdns.org/api/identity/token');

  let posted = false;
  assert.equal(await readDeployedRelease(async (url) => {
    if (url === '/api/snooker/session') {
      posted = true;
      throw Error('invalid token must never be posted');
    }
    return url === '/release.json'
      ? response(401) : response(200, { token: 'x'.repeat(8193) });
  }), null);
  assert.equal(posted, false, 'invalid/oversized token rejected in browser');

  let count = 0;
  assert.equal(await readDeployedRelease(async () => {
    count++;
    if (count === 1) return response(401);
    if (count === 2) return response(200, { token: 'test.identity.jwt' });
    if (count === 3) return response(200);
    return response(401);
  }), null, 'edge still denies access even after IdP claims a session');
  assert.equal(count, 4, 'renewal is attempted only once');
});

test('non-auth failures never trigger the refresh flow', async () => {
  let requests = 0;
  const result = await readDeployedRelease(async () => {
    requests++;
    return { ok: false, status: 503, headers: new Headers(), json: async () => null };
  });
  assert.equal(result, null);
  assert.equal(requests, 1, 'temporary Identity or Pages outage stays fail closed');
});

test('a stale deployed bundle immediately detects a newer release on its first valid poll', async () => {
  let sha = B;
  const notified = [];
  let timer;
  const watcher = createVersionWatcher({
    sourceSha: A,
    readRelease: async () => sha,
    onAvailable: () => notified.push(sha),
    repeat: (fn) => { timer = fn; return 5; },
    cancel: () => {},
  });
  watcher.start();
  // Wait for an in-flight first request or explicitly make a follow-up check.
  await watcher.check();
  assert.deepEqual(notified, [B],
    'a tab running old JS must notify even when the first release read is newer');
  await timer();
  assert.deepEqual(notified, [B], 'same release must not nag on every poll');
  sha = C;
  await timer();
  assert.deepEqual(notified, [B, C], 'later release still prompts');
  watcher.stop();
});

test('a deployed build SHA never triggers a false update on same release', async () => {
  const notified = [];
  let timer;
  const watcher = createVersionWatcher({
    sourceSha: A,
    readRelease: async () => A,
    onAvailable: () => notified.push('wrong'),
    repeat: (fn) => { timer = fn; return 9; },
    cancel: () => {},
  });
  watcher.start();
  await watcher.check();
  await timer();
  assert.deepEqual(notified, []);
  watcher.stop();
});

test('untrusted or malformed build SHAs are rejected without user prompts', () => {
  for (const sourceSha of ['', 'main', 'A'.repeat(40), 'f'.repeat(39), 3]) {
    assert.throws(() => createVersionWatcher({
      sourceSha, onAvailable: () => {}, readRelease: async () => A,
    }), TypeError);
  }
});

test('a signed-in client can recover from a denied first release read with its build baseline', async () => {
  let sha = null;
  const notified = [];
  const watcher = createVersionWatcher({
    sourceSha: A,
    readRelease: async () => sha,
    onAvailable: () => notified.push(sha),
    repeat: () => 9,
    cancel: () => {},
  });
  watcher.start();
  await watcher.check();
  assert.deepEqual(notified, [], 'identity denial is not a release event');
  sha = B;
  await watcher.check();
  assert.deepEqual(notified, [B], 'first authenticated release check can still notify');
  watcher.stop();
});
