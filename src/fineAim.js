// Pure, screen-independent fine aim rotation in the table's x/z plane.
// Positive angles rotate the cue clockwise in both supported overhead orientations.
export const FINE_AIM_STEP_DEGREES = 0.5;

export function rotateAim(dx, dz, degrees) {
  const magnitude = Math.hypot(dx, dz);
  if (!Number.isFinite(magnitude) || magnitude < 1e-9 || !Number.isFinite(degrees)) return null;
  const angle = degrees * Math.PI / 180;
  const sine = Math.sin(angle), cosine = Math.cos(angle);
  return {
    x: (dx * cosine - dz * sine) / magnitude,
    z: (dx * sine + dz * cosine) / magnitude,
  };
}
