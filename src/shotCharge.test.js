import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF_CYCLE_MS, powerAt, createShotCharge } from './shotCharge.js';

test('power climbs to full, drops to zero, then climbs again without overshooting', () => {
  assert.equal(powerAt(0), 0);
  assert.equal(powerAt(HALF_CYCLE_MS / 2), 0.5);
  assert.equal(powerAt(HALF_CYCLE_MS), 1);
  assert.equal(powerAt(HALF_CYCLE_MS * 1.5), 0.5);
  assert.equal(powerAt(HALF_CYCLE_MS * 2), 0);
  assert.equal(powerAt(HALF_CYCLE_MS * 2.5), 0.5);
  assert.equal(powerAt(HALF_CYCLE_MS * 3), 1);
  assert.equal(powerAt(-42), 0);
  assert.equal(powerAt(Number.NaN), 0);
});

test('repeated keydown cannot reset the ongoing charge', () => {
  const charge = createShotCharge();
  assert.equal(charge.start(100), true);
  assert.equal(charge.start(600), false);
  assert.equal(charge.sample(700), 0.5);
  assert.equal(charge.release(1300), 1);
  assert.equal(charge.active, false);
  assert.equal(charge.release(1600), null);
});

test('cancel on blur/restart does not accidentally fire a shot', () => {
  const charge = createShotCharge();
  assert.equal(charge.start(0), true);
  charge.cancel();
  assert.equal(charge.sample(400), null);
  assert.equal(charge.release(400), null);
  assert.equal(charge.start(500), true);
  assert.equal(charge.release(1700), 1);
});
