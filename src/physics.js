// Deterministic planar ball motion rendered in a true 3D Three.js scene.
// Units are table-relative metres, fixed-step simulation uses seconds.
export const TABLE = Object.freeze({
  halfX: 4.35,
  halfZ: 2.15,
  ballRadius: 0.145,
  pocketRadius: 0.31,
  cushionRestitution: 0.82,
  ballRestitution: 0.94,
  rollingDeceleration: 1.55,
});

export const POCKETS = Object.freeze([
  [-4.33, -2.15], [0, -2.18], [4.33, -2.15],
  [-4.33, 2.15], [0, 2.18], [4.33, 2.15],
]);

export function createRack() {
  const r = TABLE.ballRadius;
  const gap = 2 * r + 0.008;
  const balls = [{
    id: 0, number: 0, x: -2.55, z: 0, vx: 0, vz: 0, pocketed: false,
  }];
  // 15 ball triangle. Rules in this alpha are deliberately practice-only.
  const numbers = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const number = numbers[idx++];
      balls.push({
        id: number, number,
        x: 1.42 + row * gap * Math.sqrt(3) / 2,
        z: (col - row / 2) * gap,
        vx: 0, vz: 0, pocketed: false,
      });
    }
  }
  return balls;
}

export function ballsMoving(balls) {
  return balls.some((b) => !b.pocketed && (b.vx * b.vx + b.vz * b.vz) > 0.0001);
}

export function strikeCue(balls, dx, dz, power) {
  const cue = balls.find((ball) => ball.id === 0);
  const length = Math.hypot(dx, dz);
  if (!cue || cue.pocketed || ballsMoving(balls) || length < 0.0001) return false;
  const strength = Math.max(0, Math.min(1, Number(power) || 0));
  if (strength === 0) return false;
  const speed = 2.7 + strength * 8.3;
  cue.vx = dx / length * speed;
  cue.vz = dz / length * speed;
  return true;
}

export function stepPhysics(balls, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 30) {
    throw new RangeError("Physics needs a positive step <= 1/30s");
  }
  const t = TABLE;
  const r = t.ballRadius;
  const events = [];
  for (const b of balls) {
    if (b.pocketed) continue;
    b.x += b.vx * dt;
    b.z += b.vz * dt;

    // Pocket capture happens *before* cushion response; cushion segments around
    // the pocket openings are intentionally absent.
    if (capturePocket(b, events)) continue;

    const maxX = t.halfX - r;
    const maxZ = t.halfZ - r;
    if (Math.abs(b.x) > maxX) {
      b.x = Math.sign(b.x) * maxX;
      b.vx *= -t.cushionRestitution;
    }
    if (Math.abs(b.z) > maxZ) {
      b.z = Math.sign(b.z) * maxZ;
      b.vz *= -t.cushionRestitution;
    }
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - t.rollingDeceleration * dt);
      const scale = newSpeed / speed;
      b.vx *= scale;
      b.vz *= scale;
      if (newSpeed < 0.055) { b.vx = 0; b.vz = 0; }
    }
  }

  // Equal-mass elastic collision with a small positional correction.
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const diameter = 2 * r;
      if (d2 >= diameter * diameter) continue;
      const distance = Math.sqrt(d2);
      const nx = distance > 1e-9 ? dx / distance : 1;
      const nz = distance > 1e-9 ? dz / distance : 0;
      const overlap = diameter - distance;
      a.x -= nx * overlap * 0.5;
      a.z -= nz * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.z += nz * overlap * 0.5;
      const relativeNormal = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (relativeNormal >= 0) continue;
      const impulse = -(1 + t.ballRestitution) * relativeNormal / 2;
      a.vx -= impulse * nx;
      a.vz -= impulse * nz;
      b.vx += impulse * nx;
      b.vz += impulse * nz;
    }
  }
  for (const b of balls) if (!b.pocketed) capturePocket(b, events);
  return events;
}

function capturePocket(ball, events) {
  for (const [px, pz] of POCKETS) {
    if (Math.hypot(ball.x - px, ball.z - pz) < TABLE.pocketRadius) {
      ball.pocketed = true;
      ball.vx = 0;
      ball.vz = 0;
      events.push({ type: ball.id === 0 ? "scratch" : "potted", id: ball.id });
      return true;
    }
  }
  return false;
}

export function respawnCue(balls) {
  const cue = balls.find((b) => b.id === 0);
  if (!cue || !cue.pocketed || ballsMoving(balls)) return false;
  // Find a vacant point behind the baulk line rather than overlapping balls.
  for (let x = -2.55; x >= -3.8; x -= 0.3) {
    for (const z of [0, -0.38, 0.38, -0.76, 0.76, -1.14, 1.14]) {
      if (balls.every((b) => b.id === 0 || b.pocketed ||
        Math.hypot(b.x - x, b.z - z) > 2 * TABLE.ballRadius + 0.02)) {
        Object.assign(cue, { x, z, vx: 0, vz: 0, pocketed: false });
        return true;
      }
    }
  }
  return false;
}
