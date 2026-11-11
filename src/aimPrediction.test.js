import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE } from './physics.js';
import { predictFirstContact } from './aimPrediction.js';

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

test('invalid directions and scratched white yield no prediction', () => {
  assert.equal(predictFirstContact([cue()], 0, 0), null);
  assert.equal(predictFirstContact([cue()], Infinity, 0), null);
  assert.equal(predictFirstContact([cue()], NaN, 0), null);
  assert.equal(predictFirstContact([object(0, 0, 0, true)], 1, 0), null);
  assert.equal(predictFirstContact([object(1, 0, 0)], 1, 0), null);
});
