// Deterministic triangle-wave cue power. Wall-clock time is provided by the caller.
export const HALF_CYCLE_MS = 1200;

export function powerAt(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const phase = (elapsedMs / HALF_CYCLE_MS) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

export function createShotCharge() {
  let startTime = null;
  return {
    get active() { return startTime !== null; },
    start(now) {
      if (startTime !== null || !Number.isFinite(now)) return false;
      startTime = now;
      return true;
    },
    sample(now) {
      return startTime === null ? null : powerAt(now - startTime);
    },
    release(now) {
      if (startTime === null) return null;
      const power = powerAt(now - startTime);
      startTime = null;
      return power;
    },
    cancel() { startTime = null; },
  };
}
