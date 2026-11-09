// A quick tap uses the slider's selected strength; a hold uses the live
// SPACE-style charge waveform. Pure decision logic, shared by touch and mouse.
export const TAP_THRESHOLD_MS = 180;

export function resolveStrokePower(heldMs, preset, charged) {
  const clamp = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return heldMs < TAP_THRESHOLD_MS ? clamp(preset) : clamp(charged);
}
