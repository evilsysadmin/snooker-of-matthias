// Solo challenge is intentionally separate from the two-player referee.
// Every shot/ball/scratch comes from the actual deterministic 3D simulation.
export const SOLO_BEST_KEY = 'shadowops.billiards.solo15.best.v1';
export const SOLO_BALL_COUNT = 15;

function validBest(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    value.version === 1 &&
    Number.isSafeInteger(value.shots) && value.shots >= 1 && value.shots <= 100000 &&
    Number.isSafeInteger(value.scratches) && value.scratches >= 0 &&
    value.scratches <= value.shots;
}

export function readSoloBest(storageProvider = () => window.localStorage) {
  try {
    const text = storageProvider()?.getItem(SOLO_BEST_KEY);
    if (typeof text !== 'string' || text.length > 256) return null;
    const parsed = JSON.parse(text);
    return validBest(parsed) ? { shots: parsed.shots, scratches: parsed.scratches } : null;
  } catch {
    // Storage may be blocked, corrupted or unavailable (private browser).
    return null;
  }
}

export function saveSoloBest(best, storageProvider = () => window.localStorage) {
  if (!validBest({ version: 1, ...best })) return false;
  try {
    storageProvider()?.setItem(SOLO_BEST_KEY,
      JSON.stringify({ version: 1, shots: best.shots, scratches: best.scratches }));
    return true;
  } catch {
    // The current run remains playable even if quota/storage permission fails.
    return false;
  }
}

function betterThan(candidate, previous) {
  return previous === null || candidate.shots < previous.shots ||
    (candidate.shots === previous.shots && candidate.scratches < previous.scratches);
}

export function newSoloChallenge(best = null) {
  if (best !== null && !validBest({ version: 1, ...best }))
    throw new TypeError('Invalid solo best');
  return {
    shots: 0, potted: 0, remaining: SOLO_BALL_COUNT,
    scratches: 0, streak: 0, bestStreak: 0,
    completed: false, best, record: false,
    last: { kind: 'ready', balls: 0, scratch: false },
  };
}

// Call exactly once when all balls have stopped after a real stroke.
export function settleSoloShot(state, { pottedIds = [], scratch = false, remaining } = {}) {
  if (!state || state.completed || !Array.isArray(pottedIds) ||
      typeof scratch !== 'boolean' || !Number.isInteger(remaining) ||
      remaining < 0 || remaining > SOLO_BALL_COUNT) {
    throw new TypeError('Invalid solo shot');
  }
  const unique = new Set(pottedIds);
  if (unique.size !== pottedIds.length ||
      pottedIds.some((id) => !Number.isInteger(id) || id < 1 || id > 15) ||
      state.remaining - unique.size !== remaining) {
    throw new TypeError('Solo shots must match actual table events');
  }
  const shots = state.shots + 1;
  const scratches = state.scratches + Number(scratch);
  const streak = unique.size > 0 && !scratch ? state.streak + 1 : 0;
  const completed = remaining === 0;
  const candidate = { shots, scratches };
  const record = completed && betterThan(candidate, state.best);
  return {
    ...state,
    shots, scratches, streak,
    bestStreak: Math.max(state.bestStreak, streak),
    remaining, potted: SOLO_BALL_COUNT - remaining,
    completed, record,
    best: record ? candidate : state.best,
    last: {
      kind: completed ? 'cleared' : scratch ? 'scratch' :
        unique.size === 0 ? 'miss' : unique.size >= 2 ? 'multi' : 'pot',
      balls: unique.size, scratch,
    },
  };
}
