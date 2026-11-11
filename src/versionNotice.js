// Version discovery uses the audited release.json published by ShadowOps Infra.
// No changes to the Identity edge, no secret storage and no forced reloads.
const SHA = /^[a-f0-9]{40}$/;

export function trustedRelease(value) {
  return Boolean(value && typeof value === 'object' &&
    value.schema === 1 &&
    value.application === 'snooker-of-matthias' &&
    value.environment === 'staging' &&
    value.authentication?.provider === 'shadowops-id' &&
    value.authentication?.audience === 'snooker' &&
    value.authentication?.required === true &&
    typeof value.source_sha === 'string' && SHA.test(value.source_sha));
}

export async function readDeployedRelease(fetcher = fetch) {
  // Authenticated same-origin JSON only. Local Vite development has no
  // release.json, so a 404 or login response is silently treated as unknown.
  const response = await fetcher('/release.json', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return null;
  }
  const value = await response.json();
  return trustedRelease(value) ? value.source_sha : null;
}

export function createVersionWatcher({
  readRelease = readDeployedRelease,
  onAvailable,
  isVisible = () => true,
  everyMs = 90_000,
  repeat = setInterval,
  cancel = clearInterval,
}) {
  if (typeof readRelease !== 'function' || typeof onAvailable !== 'function' ||
      typeof isVisible !== 'function' || everyMs < 30_000) {
    throw new TypeError('Invalid version watcher configuration');
  }
  let initial = null;
  let notified = null;
  let inflight = false;
  let active = false;
  let timer = null;

  async function check() {
    if (!active || inflight || !isVisible()) return;
    inflight = true;
    try {
      const sha = await readRelease();
      if (typeof sha !== 'string' || !SHA.test(sha)) return;
      if (initial === null) {
        initial = sha;
      } else if (sha !== initial && sha !== notified) {
        notified = sha;
        onAvailable();
      }
    } catch {
      // Network, edge-auth, timeout and malformed JSON must never interrupt play.
    } finally {
      inflight = false;
    }
  }

  function start() {
    if (active) return;
    active = true;
    timer = repeat(check, everyMs);
    void check();
  }
  function stop() {
    active = false;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  return { start, stop, check };
}
