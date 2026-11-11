// Only the cue-stick illustration changes here. The ball impulse and the
// fixed 120 Hz physics are applied immediately in the existing game loop.
export const CUE_STROKE_DURATION_MS = 205;
export const CUE_CONTACT_MS = 52;
export const CUE_RECOIL_MS = 122;
export const CUE_TIP_LOCAL_X = 1.34;
const CONTACT_GAP = 0.033; // the visible tip cap ends 0.03 units ahead of its centre

function clampPower(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function cueIdleGap(power, charging = false) {
  const strength = clampPower(power);
  // Bigger but bounded draw-back on the real cue, with no change to ball size.
  return 0.046 + 0.16 * strength + (charging ? 0.05 + 0.09 * strength : 0);
}

export function cueStrokePose(elapsedMs, power, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < 0 ||
      elapsedMs >= CUE_STROKE_DURATION_MS) return null;
  const strength = clampPower(power);
  const rest = cueIdleGap(strength);
  const recoil = rest + 0.055;
  if (elapsedMs < CUE_CONTACT_MS) {
    // Accelerating forward gives a deliberate tap at the cue-ball surface.
    const u = elapsedMs / CUE_CONTACT_MS;
    return {
      phase: 'forward',
      gap: rest + (CONTACT_GAP - rest) * (u * u * u),
      lift: 0,
    };
  }
  if (elapsedMs < CUE_RECOIL_MS) {
    const u = (elapsedMs - CUE_CONTACT_MS) / (CUE_RECOIL_MS - CUE_CONTACT_MS);
    const eased = 1 - (1 - u) ** 3;
    return {
      phase: 'recoil',
      gap: CONTACT_GAP + (recoil - CONTACT_GAP) * eased,
      lift: 0.012 * u,
    };
  }
  const u = (elapsedMs - CUE_RECOIL_MS) / (CUE_STROKE_DURATION_MS - CUE_RECOIL_MS);
  const smooth = u * u * (3 - 2 * u);
  return { phase: 'settle', gap: recoil + (rest - recoil) * smooth, lift: 0.012 * (1 - smooth) };
}
