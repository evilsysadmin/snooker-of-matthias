import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE, cueStrikeSpeed, strikeCue, stepPhysics } from './physics.js';
import { predictFirstContact, predictFirstRailBounce, predictNeutralStrokeContact } from './aimPrediction.js';

const cue = (x = 0, z = 0) => ({ id: 0, x, z, vx: 0, vz: 0, pocketed: false });
const object = (id, x, z, pocketed = false) => ({ id, x, z, vx: 0, vz: 0, pocketed });

test('head-on preview ends at centre of white when it first touches the closest object', () => {
  const balls = [cue(), object(2, 2, 0), object(1, 1, 0)];
  const before = structuredClone(balls);
  const hit = predictFirstContact(balls, 6, 0);
  assert.equal(hit.ballId, 1);
  assert.ok(Math.abs(hit.distance - (1 - 2 * TABLE.ballRadius)) < 1e-9);
  assert.ok(Math.abs(hit.x - hit.distance) < 1e-9);
  assert.equal(hit.z, 0);
  assert.deepEqual(balls, before, 'aim prediction must never mutate physics');
});

test('off-axis collision and tangent contact respect the diameter of two balls', () => {
  const near = predictFirstContact([cue(), object(5, 1, TABLE.ballRadius)], 1, 0);
  assert.equal(near.ballId, 5);
  assert.ok(near.distance > 0 && near.distance < 1);
  const tangent = predictFirstContact([cue(), object(4, 1, 2 * TABLE.ballRadius)], 1, 0);
  assert.equal(tangent.ballId, 4);
  assert.ok(Math.abs(tangent.distance - 1) < 1e-6);
  const miss = predictFirstContact([cue(), object(4, 1, 2 * TABLE.ballRadius + 0.001)], 1, 0);
  assert.equal(miss.ballId, null);
});

test('misses end at the first cushion, including diagonal and negative directions', () => {
  const xWall = TABLE.halfX - TABLE.ballRadius;
  const zWall = TABLE.halfZ - TABLE.ballRadius;
  const horizontal = predictFirstContact([cue()], -8, 0);
  assert.equal(horizontal.ballId, null);
  assert.ok(Math.abs(horizontal.x + xWall) < 1e-9);
  const diagonal = predictFirstContact([cue()], 1, 1);
  assert.equal(diagonal.ballId, null);
  assert.ok(Math.abs(diagonal.z - zWall) < 1e-9);
  assert.ok(diagonal.x < xWall);
});

test('pocketed, rear and beyond-cushion balls are excluded from the preview', () => {
  const balls = [cue(), object(1, 0.6, 0, true), object(2, -1, 0), object(3, 6, 0)];
  const hit = predictFirstContact(balls, 1, 0);
  assert.equal(hit.ballId, null);
  assert.ok(Math.abs(hit.distance - (TABLE.halfX - TABLE.ballRadius)) < 1e-9);
});

test('aiming towards a pocket shoulder ends at jaw contact, not through the cushion', () => {
  const balls = [cue(0.22, 1.6)];
  const before = structuredClone(balls);
  const preview = predictFirstContact(balls, 0, 1);
  assert.equal(preview.ballId, null);
  assert.notEqual(preview.jawIndex, null);
  assert.ok(preview.z < TABLE.halfZ - TABLE.ballRadius,
    'the round jaw must be hit before the straight cushion');
  assert.ok(preview.z > 1.85, 'jaw contact lies at the actual pocket mouth');
  assert.ok(Math.abs(preview.x - 0.22) < 1e-9);
  assert.deepEqual(balls, before, 'prediction is pure geometry');
});

test('a ball before the jaw still wins the first-contact preview', () => {
  const preview = predictFirstContact([cue(0.22, 1.6), object(7, 0.22, 1.8)], 0, 1);
  assert.equal(preview.ballId, 7);
  assert.equal(preview.jawIndex, null);
});

test('direct middle-pocket approaches stop at the real capture mouth before the rail', () => {
  for (const sign of [-1, 1]) {
    const balls = [cue(0, sign * 1.6)];
    const before = structuredClone(balls);
    const preview = predictFirstContact(balls, 0, sign);
    assert.equal(preview.ballId, null);
    assert.equal(preview.jawIndex, null);
    assert.equal(preview.pocketIndex, sign > 0 ? 4 : 1);
    const expectedZ = sign * (2.18 - TABLE.middlePocketRadius);
    assert.ok(Math.abs(preview.z - expectedZ) < 1e-9);
    assert.ok(Math.abs(preview.z) < TABLE.halfZ - TABLE.ballRadius);
    assert.deepEqual(balls, before, 'aim preview never mutates the rack');
  }
});

test('an object in the pocket lane wins first contact over the later capture', () => {
  const preview = predictFirstContact([cue(0, 1.6), object(5, 0, 1.85)], 0, 1);
  assert.equal(preview.ballId, 5);
  assert.equal(preview.jawIndex, null);
  assert.equal(preview.pocketIndex, null);
});

test('a grazing approach keeps the jaw/cushion prediction instead of claiming a pot', () => {
  const jaw = predictFirstContact([cue(0.22, 1.6)], 0, 1);
  assert.notEqual(jaw.jawIndex, null);
  assert.equal(jaw.pocketIndex, null);
  const miss = predictFirstContact([cue(0.45, 1.6)], 0, 1);
  assert.equal(miss.pocketIndex, null);
  assert.ok(Math.abs(miss.z - (TABLE.halfZ - TABLE.ballRadius)) < 1e-9);
});

test('the aiming guide sees all four clean diagonal corner mouths with enlarged balls', () => {
  // 48-degree entry clears both jaw colliders with the shared 0.112m ball radius.
  // The old 46-degree example now grazes a jaw: don't pretend it is a clean pot.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const preview = predictFirstContact([cue(sx * 3.79, sz * 1.55)],
      sx * 0.54, sz * 0.60);
    const pocket = sx < 0 ? (sz < 0 ? 0 : 3) : (sz < 0 ? 2 : 5);
    assert.equal(preview.pocketIndex, pocket);
    assert.equal(preview.ballId, null);
    assert.equal(preview.jawIndex, null);
  }
});

test('straight rails, jaw grazes and open pockets remain mutually exclusive', () => {
  for (const [x, z, dx, dz, axis] of [
    [3.6, -0.6, 1, 0.2, 'x'],
    [-3.6, -0.6, -1, 0.2, 'x'],
    [-0.6, 1.5, 0.2, 1, 'z'],
    [-0.6, -1.5, 0.2, -1, 'z'],
  ]) {
    const first = predictFirstContact([cue(x, z)], dx, dz);
    assert.equal(first.railAxis, axis);
    assert.equal(first.ballId, null);
    assert.equal(first.jawIndex, null);
    assert.equal(first.pocketIndex, null);
    const bounce = predictFirstRailBounce([cue(x, z)], dx, dz);
    assert.equal(bounce?.railAxis, axis);
    assert.ok(Math.hypot(bounce.endX - bounce.x, bounce.endZ - bounce.z) <= 0.801);
    if (axis === 'x') assert.ok((bounce.endX - bounce.x) * dx < 0);
    if (axis === 'z') assert.ok((bounce.endZ - bounce.z) * dz < 0);
    // Compare signs against the actual 120 Hz physics, NOT drawn pixels.
    const moving = [cue(x, z)];
    assert.equal(strikeCue(moving, dx, dz, 1), true);
    let reversed = false;
    for (let i = 0; i < 180; i++) {
      stepPhysics(moving, 1 / 120);
      const ball = moving[0];
      if (axis === 'x' ? ball.vx * dx < 0 : ball.vz * dz < 0) {
        reversed = true;
        assert.ok((bounce.endX - bounce.x) * ball.vx > 0 ||
          (bounce.endZ - bounce.z) * ball.vz > 0,
        'indicated bank segment points along the real post-collision velocity');
        break;
      }
    }
    assert.equal(reversed, true, 'real cushion rebound must happen');
  }
  for (const [balls, dx, dz, expectedPocket, expectedJaw] of [
    [[cue(0, 1.6)], 0, 1, 4, null],
    [[cue(0.22, 1.6)], 0, 1, null, true],
    [[cue(3.79, 1.55)], 0.54, 0.6, 5, null],
  ]) {
    const first = predictFirstContact(balls, dx, dz);
    assert.equal(first.railAxis, null);
    if (expectedPocket !== null) assert.equal(first.pocketIndex, expectedPocket);
    if (expectedJaw) assert.notEqual(first.jawIndex, null);
    assert.equal(predictFirstRailBounce(balls, dx, dz), null);
  }
});

test('bank hint stops before another ball and never reports it as a second pot', () => {
  const clear = predictFirstRailBounce([cue(3.6, 0)], 1, 0, 1.5);
  const blocked = predictFirstRailBounce([cue(3.6, 0), object(7, 3.3, 0)], 1, 0, 1.5);
  assert.equal(clear.railAxis, 'x');
  assert.ok(blocked.endX > clear.endX + 0.2,
    'rebound hint must stop before it would pass through the next object ball');
  assert.equal(predictFirstContact([cue(3.6, 0), object(7, 3.3, 0)], 1, 0).ballId, null,
    'a ball behind the cue must not affect the original outward shot');
  assert.equal(predictFirstRailBounce([cue(3.6, 0)], 1, 0, Infinity), null);
  assert.equal(predictFirstRailBounce([cue(3.6, 0)], 1, 0, -1), null);
});

test('bank hint respects actual selected power and shared cloth drag', () => {
  const far = [cue(0, 0)], railX = TABLE.halfX - TABLE.ballRadius;
  const first = predictFirstContact(far, 1, 0);
  assert.equal(first.railAxis, 'x');
  assert.ok(Math.abs(first.distance - railX) < 1e-9);
  assert.equal(cueStrikeSpeed(0), 0);
  assert.equal(predictFirstRailBounce(far, 1, 0, 0.8, 0), null);
  assert.equal(predictFirstRailBounce(far, 1, 0, 0.8, 0.01), null,
    'a genuinely weak positive stroke cannot travel across half the table');
  const low = [cue(0, 0)];
  assert.equal(strikeCue(low, 1, 0, 0.01), true);
  for (let i = 0; i < 1300; i++) stepPhysics(low, 1 / 120);
  assert.ok(low[0].x < railX - 0.8 && low[0].vx === 0,
    'real low-power ball stops far before the cushion, without rebounding');
  const bank = predictFirstRailBounce(far, 1, 0, 0.8, 0.25);
  assert.ok(bank?.endX < bank.x, 'sufficient power permits a real bank');
  assert.equal(predictFirstRailBounce(far, 1, 0, 0.8, 0.14), null,
    'the gentler 14% stroke stops before the far rail');
  const partial = predictFirstRailBounce(far, 1, 0, 0.8, 0.21);
  assert.ok(partial && Math.hypot(partial.endX - partial.x, partial.endZ - partial.z) < 0.8,
    'modest remaining energy reduces the rebound hint length');
  const fast = predictFirstRailBounce(far, 1, 0, 0.8, 1);
  assert.ok(fast && Math.hypot(fast.endX - fast.x, fast.endZ - fast.z) > 0.79);
  assert.equal(predictFirstRailBounce(far, 1, 0, 0.8, NaN), null);
  assert.equal(predictFirstRailBounce(far, 1, 0, 0.8, -1), null);
});

test('neutral soft shots stop the guide before unreachable object, cushion, jaw or pocket', () => {
  const cases = [
    { balls: [cue(), object(3, 1.5, 0)], dx: 1, dz: 0, kind: 'ball' },
    { balls: [cue()], dx: -1, dz: 0, kind: 'rail' },
    { balls: [cue(0.22, 1.6)], dx: 0, dz: 1, kind: 'jaw' },
    { balls: [cue(0, 1.6)], dx: 0, dz: 1, kind: 'pocket' },
  ];
  for (const { balls, dx, dz, kind } of cases) {
    const pristine = structuredClone(balls);
    const first = predictFirstContact(balls, dx, dz);
    assert.ok(first, kind);
    const short = predictNeutralStrokeContact(balls, dx, dz, 0.05);
    assert.equal(short.stopsShort, true, kind);
    assert.ok(short.distance < first.distance, kind);
    assert.equal(short.ballId, null);
    assert.equal(short.pocketIndex, null);
    assert.equal(short.jawIndex, null);
    assert.equal(short.railAxis, null);
    assert.deepEqual(balls, pristine, 'preview must not mutate simulation');
    const strong = predictNeutralStrokeContact(balls, dx, dz, 1);
    assert.equal(strong.stopsShort, false, kind);
    assert.equal(strong.ballId, first.ballId);
    assert.equal(strong.pocketIndex, first.pocketIndex);
    assert.equal(strong.jawIndex, first.jawIndex);
    assert.equal(strong.railAxis, first.railAxis);
  }
});

test('neutral stop marker is close to actual 120 Hz simulation distance', () => {
  for (const power of [0.05, 0.1, 0.15]) {
    const balls = [cue()], intended = predictNeutralStrokeContact(balls, 1, 0, power);
    assert.equal(intended.stopsShort, true);
    assert.ok(intended.distance >= 0);
    assert.equal(strikeCue(balls, 1, 0, power), true);
    for (let i = 0; i < 900; i++) stepPhysics(balls, 1 / 120);
    assert.equal(balls[0].vx, 0);
    assert.ok(balls[0].x >= intended.distance - 0.03,
      'conservative preview should not overshoot real stop');
    assert.ok(balls[0].x - intended.distance < 0.09,
      'soft preview should remain close to real stopping distance');
  }
  const still = predictNeutralStrokeContact([cue(), object(1, 1, 0)], 1, 0, 0);
  assert.equal(still.stopsShort, true);
  assert.equal(still.distance, 0);
  assert.equal(still.ballId, null);
  assert.equal(predictNeutralStrokeContact([cue()], 0, 0, 0.4), null);
  assert.equal(predictNeutralStrokeContact([object(0, 0, 0, true)], 1, 0, 0.4), null);
});

test('a reachable near ball retains the real first-contact guide at low power', () => {
  const near = [cue(), object(7, 0.29, 0)];
  const predicted = predictNeutralStrokeContact(near, 1, 0, 0.05);
  assert.equal(predicted.stopsShort, false);
  assert.equal(predicted.ballId, 7);
  assert.ok(predicted.distance < 0.1);
});

test('invalid directions and scratched white yield no prediction', () => {
  assert.equal(predictFirstContact([cue()], 0, 0), null);
  assert.equal(predictFirstContact([cue()], Infinity, 0), null);
  assert.equal(predictFirstContact([cue()], NaN, 0), null);
  assert.equal(predictFirstContact([object(0, 0, 0, true)], 1, 0), null);
  assert.equal(predictFirstContact([object(1, 0, 0)], 1, 0), null);
});
