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
    scratches: 0, streak: 0, bestStreak: 0, dryStreak: 0,
    completed: false, best, record: false,
    last: { kind: 'ready', balls: 0, scratch: false },
  };
}

// Derive Solo 15 HUD copy from actual simulator state, not from DOM events.
export function soloStatusText(state) {
  const best = state.best
    ? 'Récord: ' + state.best.shots + ' tiros' +
      (state.best.scratches ? ' · ' + state.best.scratches + ' faltas' : '')
    : 'Sin récord';
  // Optimistic shot budget: a tie in strokes wins only with fewer scratches.
  // This never predicts the physics or promises a record.
  const budget = state.best
    ? state.best.shots - state.shots - Number(state.scratches >= state.best.scratches)
    : null;
  const pressure = budget === null || budget > 3 ? '' :
    budget <= 0 ? ' · Marca fuera de alcance' :
    ' · Margen: ' + budget + (budget === 1 ? ' tiro' : ' tiros');
  return state.completed
    ? (state.record ? '🏆 ¡Nuevo récord!' : '✓ Mesa limpia') +
      ' · ' + state.shots + ' tiros · ' + best
    : '🎱 Desafío 15 · ' + state.remaining + ' restantes · racha ' +
      state.streak + ' · ' + best + pressure;
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
    dryStreak: unique.size === 0 && !scratch ? state.dryStreak + 1 : 0,
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

// Feedback from settled shots only. Do not infer cue angle, power or intent.
export function soloShotCommentary(state) {
  if (state.completed) {
    const shots = state.shots + (state.shots === 1 ? ' tiro' : ' tiros');
    return state.record
      ? 'Matthias: ¡Mesa limpia en ' + shots + '! Nuevo récord. Respetable.'
      : 'Matthias: Mesa limpia en ' + shots + '. Mejor racha: ' + state.bestStreak + '.';
  }
  if (state.last.kind === 'scratch') {
    return 'Matthias: Blanca en mano. Elige un hueco libre en la mesa, o pulsa COLOCAR.';
  }
  if (state.last.kind === 'multi') {
    return 'Matthias: ' + state.last.balls + ' bolas de un tiro. La geometría te sonríe.';
  }
  if (state.last.kind === 'pot') {
    if (state.streak >= 3) return 'Matthias: Racha de ' + state.streak + '. Empiezo a temer por mi empleo.';
    if (state.streak === 2) return 'Matthias: Dos tiros seguidos embocando. Mantén ese ritmo.';
    return 'Matthias: Una dentro. Piensa también dónde quedará la blanca.';
  }
  if (state.last.kind === 'miss') {
    if (state.dryStreak >= 3) return 'Matthias: ' + state.dryStreak + ' tiros sin embocar. Prueba un tiro sencillo.';
    if (state.dryStreak === 2) return 'Matthias: Dos tiros en seco. Usa la vista cenital para apuntar.';
    return 'Matthias: Un tiro y ninguna bola. El billar sigue invicto.';
  }
  return null;
}
