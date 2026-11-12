// Version discovery uses the audited release.json published by ShadowOps Infra.
// No changes to the Identity edge, no secret storage and no forced reloads.
const SHA = /^[a-f0-9]{40}$/;

// A release prompt is secondary to the player's active stroke. The balls
// stopping is not enough: the cue may still be charging, being dragged, or
// completing its contact/recoil animation. This is presentation-only;
// no physics, input controls or authenticated release contract changes.
export function canShowUpdateNotice({ moving, charging, pointerStroke, strokeAnimation }) {
  return !moving && !charging && !pointerStroke && !strokeAnimation;
}

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

const ISSUER = 'https://id-staging.shadowops.dpdns.org';

async function renewSession(fetcher) {
  // The edge's __Host- cookie is intentionally short-lived. Reuse its
  // existing signed-in Identity flow; the browser never persists the token.
  // If the user is logged out or revoked, Identity/edge deny the renewal.
  const auth = await fetcher(ISSUER + '/api/identity/token', {
    method: 'POST', credentials: 'include', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(6000),
  });
  if (!auth.ok) return false;
  const value = await auth.json();
  if (!value || typeof value.token !== 'string' ||
      value.token.length === 0 || value.token.length > 8192) return false;
  const session = await fetcher('/api/snooker/session', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: value.token }),
    signal: AbortSignal.timeout(6000),
  });
  return session.ok;
}

export async function readDeployedRelease(fetcher = fetch) {
  // Only protected same-origin JSON; local Vite 404 stays silent. The
  // one-time 401 recovery restores a still-valid Identity session so a tab
  // left open for hours can detect newer deployments. No blind retries.
  const request = () => fetcher('/release.json', {
    credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  let response = await request();
  if (response.status === 401) {
    if (!await renewSession(fetcher)) return null;
    response = await request();
  }
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return null;
  }
  const value = await response.json();
  return trustedRelease(value) ? value.source_sha : null;
}

export function createVersionWatcher({
  readRelease = readDeployedRelease,
  // The build SHA is the only trustworthy baseline for already-open clients.
  // Local dev can omit it and retain the first-valid-read fallback.
  sourceSha = null,
  onAvailable,
  isVisible = () => true,
  everyMs = 90_000,
  repeat = setInterval,
  cancel = clearInterval,
}) {
  if (typeof readRelease !== 'function' || typeof onAvailable !== 'function' ||
      typeof isVisible !== 'function' || everyMs < 30_000 ||
      (sourceSha !== null && (typeof sourceSha !== 'string' || !SHA.test(sourceSha)))) {
    throw new TypeError('Invalid version watcher configuration');
  }
  let initial = sourceSha;
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
        // Only for local/unversioned builds; production supplies sourceSha.
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
