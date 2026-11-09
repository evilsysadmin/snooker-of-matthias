import { TABLE } from './physics.js';

// Returns where the white ball's CENTRE first reaches a stationary ball or a
// cushion when travelling along the chosen direction. Pure geometry only:
// no spin, rail rebound prediction, shot power or physics state mutation.
export function predictFirstContact(balls, dx, dz) {
  const cue = balls.find((ball) => ball.id === 0);
  const magnitude = Math.hypot(dx, dz);
  if (!cue || cue.pocketed || !Number.isFinite(magnitude) || magnitude < 1e-9) return null;
  const ux = dx / magnitude, uz = dz / magnitude;
  const wallX = TABLE.halfX - TABLE.ballRadius;
  const wallZ = TABLE.halfZ - TABLE.ballRadius;

  // Distance to the first straight cushion, measured from the ball centre.
  let distance = Infinity;
  if (Math.abs(ux) > 1e-9) {
    distance = Math.min(distance, ((ux > 0 ? wallX : -wallX) - cue.x) / ux);
  }
  if (Math.abs(uz) > 1e-9) {
    distance = Math.min(distance, ((uz > 0 ? wallZ : -wallZ) - cue.z) / uz);
  }
  distance = Math.max(0, distance);
  let ballId = null;
  const diameterSquared = (2 * TABLE.ballRadius) ** 2;

  for (const ball of balls) {
    if (ball.id === 0 || ball.pocketed) continue;
    const px = ball.x - cue.x, pz = ball.z - cue.z;
    const projection = px * ux + pz * uz;
    if (projection < 0) continue;
    const closestSquared = Math.max(0, px * px + pz * pz - projection * projection);
    // Account for floating-point rounding at exact tangency without
    // widening the actual ball radius by a visually meaningful amount.
    if (closestSquared > diameterSquared + 1e-12) continue;
    const travel = Math.max(0, projection - Math.sqrt(Math.max(0, diameterSquared - closestSquared)));
    if (travel < distance - 1e-9) {
      distance = travel;
      ballId = ball.id;
    }
  }
  return { x: cue.x + distance * ux, z: cue.z + distance * uz, distance, ballId };
}
