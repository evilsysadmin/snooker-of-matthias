// Deterministic planar ball motion rendered in a true 3D Three.js scene.
// Units are table-relative metres, fixed-step simulation uses seconds.
export const TABLE = Object.freeze({
  halfX: 4.35,
  halfZ: 2.15,
  // Approximate American pool ball/table proportions, while keeping the
  // balls legible on phone-sized 3D canvases.
  ballRadius: 0.095,
  // Capture radii match the visible mouths. Middle pockets are a little more
  // forgiving; these are tuned game approximations, not WPBSA pocket templates.
  pocketRadius: 0.175,
  middlePocketRadius: 0.195,
  cushionRestitution: 0.82,
  jawRestitution: 0.72,
  jawRadius: 0.060,
  ballRestitution: 0.94,
  rollingDeceleration: 1.55,
  // Bounded cloth traction for cue follow/draw (not a rigid-body spin solver).
  cueSpinTransferRate: 5.0,
});

// American eight-ball opening rack: seven solids, seven stripes, the black
// eight ball and the white cue ball. Free practice, not turn-based 8-ball yet.
export const OBJECT_BALL_COUNT = 15;

export const POCKETS = Object.freeze([
  [-4.33, -2.15, TABLE.pocketRadius], [0, -2.18, TABLE.middlePocketRadius], [4.33, -2.15, TABLE.pocketRadius],
  [-4.33, 2.15, TABLE.pocketRadius], [0, 2.18, TABLE.middlePocketRadius], [4.33, 2.15, TABLE.pocketRadius],
]);

// Rounded cushion tips at the entrance to every pocket. Both the render and
// the fixed-step solver consume these same immutable centres/radii. They are a
// restrained 2D jaw approximation, not an official WPBSA pocket template.
export const POCKET_JAWS = Object.freeze(POCKETS.flatMap(([px, pz]) => {
  const sz = Math.sign(pz);
  const r = TABLE.jawRadius;
  if (px === 0) {
    return [-1, 1].map((sx) => Object.freeze({
      x: sx * 0.25, z: sz * (TABLE.halfZ - 0.045), radius: r,
      railX: sx * 0.355, railZ: sz * (TABLE.halfZ - 0.005),
    }));
  }
  const sx = Math.sign(px);
  return [
    Object.freeze({
      x: sx * (TABLE.halfX - 0.23), z: sz * (TABLE.halfZ - 0.045), radius: r,
      railX: sx * 4.225, railZ: sz * (TABLE.halfZ - 0.005),
    }),
    Object.freeze({
      x: sx * (TABLE.halfX - 0.05), z: sz * (TABLE.halfZ - 0.23), radius: r,
      railX: sx * TABLE.halfX, railZ: sz * 1.815,
    }),
  ];
}));

// Opening cue lies on the head string, centred across the table. The rack
// apex lies on the foot spot. This replaces snooker's baulk/D/colour spots.
export const CUE_START = Object.freeze({ x: -2.40, z: 0 });
export const RACK_APEX = Object.freeze({ x: 2.05, z: 0 });

export function createRack() {
  const gap = 2 * TABLE.ballRadius + 0.006;
  const balls = [{
    id: 0, number: 0, x: CUE_START.x, z: CUE_START.z,
    vx: 0, vz: 0, pocketed: false,
  }];

  // Deterministic five-row pool triangle. The eight is in the centre of
  // row three; the two back corners hold one stripe and one solid.
  // Never duplicate or omit a numbered ball.
  const rows = [
    [1],
    [10, 2],
    [3, 8, 11],
    [12, 4, 13, 5],
    [9, 6, 14, 15, 7],
  ];
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      const id = rows[row][col];
      balls.push({
        id, number: id,
        x: RACK_APEX.x + row * gap * Math.sqrt(3) / 2,
        z: (col - row / 2) * gap,
        vx: 0, vz: 0, pocketed: false,
      });
    }
  }
  return balls;
}

export function ballsMoving(balls) {
  return balls.some((b) => !b.pocketed &&
    ((b.vx * b.vx + b.vz * b.vz) > 0.0001 ||
      (b.id === 0 && Math.hypot(b.spinVx || 0, b.spinVz || 0) > 0.01)));
}

export function strikeCue(balls, dx, dz, power, followDraw = 0) {
  const cue = balls.find((ball) => ball.id === 0);
  const length = Math.hypot(dx, dz);
  if (!cue || cue.pocketed || ballsMoving(balls) || length < 0.0001) return false;
  const strength = Math.max(0, Math.min(1, Number(power) || 0));
  if (strength === 0) return false;
  const speed = 2.7 + strength * 8.3;
  cue.vx = dx / length * speed;
  cue.vz = dz / length * speed;
  // Retained forward/backward rolling motion couples into the cue velocity
  // progressively via cloth traction. Neutral shots retain legacy physics.
  const spin = Number.isFinite(followDraw) ? Math.max(-1, Math.min(1, followDraw)) : 0;
  cue.spinVx = cue.vx * spin * 0.42;
  cue.spinVz = cue.vz * spin * 0.42;
  return true;
}

export function stepPhysics(balls, dt, { trackContacts = false } = {}) {
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

    // Legitimate pocket entries are captured before a jaw could reject them.
    if (capturePocket(b, events)) continue;

    // Pocket shoulders are real, rounded cushions: a grazing shot loses its
    // inward velocity component instead of disappearing into a circular hole.
    for (const jaw of POCKET_JAWS) {
      const dx = b.x - jaw.x, dz = b.z - jaw.z;
      const minDistance = r + jaw.radius;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= minDistance * minDistance) continue;
      const distance = Math.sqrt(distanceSquared);
      // At a coincident centre, push inward from the closest table edge.
      const nx = distance > 1e-9 ? dx / distance :
        (Math.abs(jaw.x) > t.halfX / 2 ? -Math.sign(jaw.x) : 0);
      const nz = distance > 1e-9 ? dz / distance :
        (Math.abs(jaw.x) > t.halfX / 2 ? 0 : -Math.sign(jaw.z));
      b.x = jaw.x + nx * minDistance;
      b.z = jaw.z + nz * minDistance;
      const normalVelocity = b.vx * nx + b.vz * nz;
      if (normalVelocity < 0) {
        if (trackContacts && normalVelocity < -0.03) events.push({ type: 'rail', id: b.id });
        b.vx -= (1 + t.jawRestitution) * normalVelocity * nx;
        b.vz -= (1 + t.jawRestitution) * normalVelocity * nz;
      }
    }

    const maxX = t.halfX - r;
    const maxZ = t.halfZ - r;
    if (Math.abs(b.x) > maxX) {
      if (trackContacts && Math.sign(b.x) * b.vx > 0.03)
        events.push({ type: 'rail', id: b.id });
      b.x = Math.sign(b.x) * maxX;
      b.vx *= -t.cushionRestitution;
    }
    if (Math.abs(b.z) > maxZ) {
      if (trackContacts && Math.sign(b.z) * b.vz > 0.03)
        events.push({ type: 'rail', id: b.id });
      b.z = Math.sign(b.z) * maxZ;
      b.vz *= -t.cushionRestitution;
    }
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - t.rollingDeceleration * dt);
      const scale = newSpeed / speed;
      b.vx *= scale;
      b.vz *= scale;
      // Do not snap a still-spinning white to rest: a weak draw needs
      // multiple 120 Hz traction steps to build up a visible reverse roll.
      const cueStillSpinning = b.id === 0 &&
        Math.hypot(b.spinVx || 0, b.spinVz || 0) > 0.01;
      if (newSpeed < 0.055 && !cueStillSpinning) { b.vx = 0; b.vz = 0; }
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
      if (trackContacts) events.push({ type: 'contact', a: a.id, b: b.id });
      a.vx -= impulse * nx;
      a.vz -= impulse * nz;
      b.vx += impulse * nx;
      b.vz += impulse * nz;
    }
  }
  for (const b of balls) if (!b.pocketed) capturePocket(b, events);

  // Simplified cloth traction: top/backspin gradually transfers its remaining
  // impulse into cue-ball translation, including after collision. No effect on
  // object balls, and no hidden side spin or invented rebound predictions.
  const cue = balls.find((b) => b.id === 0);
  if (cue && !cue.pocketed) {
    const magnitude = Math.hypot(cue.spinVx || 0, cue.spinVz || 0);
    if (magnitude > 1e-9) {
      const transfer = Math.min(magnitude, t.cueSpinTransferRate * dt);
      const share = transfer / magnitude;
      const impulseX = cue.spinVx * share, impulseZ = cue.spinVz * share;
      cue.vx += impulseX;
      cue.vz += impulseZ;
      cue.spinVx -= impulseX;
      cue.spinVz -= impulseZ;
    }
  }
  return events;
}

function capturePocket(ball, events) {
  for (let pocket = 0; pocket < POCKETS.length; pocket++) {
    const [px, pz, radius] = POCKETS[pocket];
    if (Math.hypot(ball.x - px, ball.z - pz) < radius) {
      ball.pocketed = true;
      ball.vx = 0;
      ball.vz = 0;
      if (ball.id === 0) { ball.spinVx = 0; ball.spinVz = 0; }
      events.push({ type: ball.id === 0 ? "scratch" : "potted", id: ball.id, pocket });
      return true;
    }
  }
  return false;
}

// In pool free practice, a scratched white is ball-in-hand anywhere on the
// playing cloth, not confined to snooker's D. Movement must have stopped and
// the chosen position may not overlap an object ball or a pocket.
export function canPlaceCueOnTable(balls, x, z) {
  const cue = balls.find((b) => b.id === 0);
  if (!cue?.pocketed || ballsMoving(balls) ||
      !Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > TABLE.halfX - TABLE.ballRadius ||
      Math.abs(z) > TABLE.halfZ - TABLE.ballRadius) return false;
  if (POCKETS.some(([px, pz, radius]) =>
    Math.hypot(px - x, pz - z) < radius + TABLE.ballRadius)) return false;
  return balls.every((b) => b.id === 0 || b.pocketed ||
    Math.hypot(b.x - x, b.z - z) >= 2 * TABLE.ballRadius + 0.004);
}

export function respawnCue(balls, x, z) {
  const cue = balls.find((b) => b.id === 0);
  if (!cue) return false;
  const put = (px, pz) => {
    if (!canPlaceCueOnTable(balls, px, pz)) return false;
    Object.assign(cue, { x: px, z: pz, vx: 0, vz: 0,
      spinVx: 0, spinVz: 0, pocketed: false });
    return true;
  };
  if (x !== undefined || z !== undefined) return put(x, z);

  // Accessible keyboard fallback: favour the original centred head spot,
  // then deterministic nearby grid locations. Never force an overlap.
  for (const px of [CUE_START.x, -2.8, -2.0, -3.2, -1.6, -3.6, -1.2, 0]) {
    for (const pz of [0, 0.32, -0.32, 0.64, -0.64, 0.96, -0.96]) {
      if (put(px, pz)) return true;
    }
  }
  return false;
}
