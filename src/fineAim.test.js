import test from 'node:test';
import assert from 'node:assert/strict';
import { FINE_AIM_STEP_DEGREES, rotateAim } from './fineAim.js';

test('one tap rotates half a degree without changing vector magnitude', () => {
  assert.equal(FINE_AIM_STEP_DEGREES, 0.5);
  const rotated = rotateAim(1, 0, FINE_AIM_STEP_DEGREES);
  assert.ok(Math.abs(rotated.z - Math.sin(Math.PI / 360)) < 1e-12);
  assert.ok(Math.abs(rotated.x - Math.cos(Math.PI / 360)) < 1e-12);
  assert.ok(Math.abs(Math.hypot(rotated.x, rotated.z) - 1) < 1e-12);
});

test('left and right fine aim are inverse even after repeated adjustments', () => {
  let direction = { x: -0.2, z: 0.4 };
  const initial = rotateAim(direction.x, direction.z, 0);
  for (let n = 0; n < 12; n++) direction = rotateAim(direction.x, direction.z, -FINE_AIM_STEP_DEGREES);
  for (let n = 0; n < 12; n++) direction = rotateAim(direction.x, direction.z, FINE_AIM_STEP_DEGREES);
  assert.ok(Math.abs(direction.x - initial.x) < 1e-12);
  assert.ok(Math.abs(direction.z - initial.z) < 1e-12);
});

test('fine aiming works in any quadrant and never mutates the supplied direction', () => {
  const input = { x: -3, z: -4 };
  const before = { ...input };
  const direction = rotateAim(input.x, input.z, -FINE_AIM_STEP_DEGREES);
  assert.deepEqual(input, before);
  assert.ok(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-12);
  assert.ok(direction.x < 0 && direction.z < 0);
});

test('zero length, infinite and NaN input are rejected', () => {
  assert.equal(rotateAim(0, 0, 0.5), null);
  assert.equal(rotateAim(Infinity, 0, 0.5), null);
  assert.equal(rotateAim(1, 0, NaN), null);
  assert.equal(rotateAim(1, 0, Infinity), null);
});
