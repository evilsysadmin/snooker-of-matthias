import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStrokePower, TAP_THRESHOLD_MS } from './strokeInteraction.js';
import { createShotCharge, HALF_CYCLE_MS } from './shotCharge.js';

test('a tap uses the selected slider power instead of an accidentally tiny charge', () => {
  assert.equal(resolveStrokePower(0, 0.55, 0), 0.55);
  assert.equal(resolveStrokePower(TAP_THRESHOLD_MS - 1, 0.73, 0.1), 0.73);
  assert.equal(resolveStrokePower(TAP_THRESHOLD_MS, 0.73, 0.15), 0.15);
});

test('holding the strike button matches the deterministic SPACE charge curve', () => {
  const charge = createShotCharge();
  charge.start(100);
  const hold = HALF_CYCLE_MS / 2;
  const charged = charge.release(100 + hold);
  assert.equal(resolveStrokePower(hold, 0.9, charged), 0.5);
  assert.equal(charge.active, false);
});

test('unexpected strength values are safely bounded', () => {
  assert.equal(resolveStrokePower(0, 3, 0.5), 1);
  assert.equal(resolveStrokePower(0, NaN, 0.5), 0);
  assert.equal(resolveStrokePower(1000, 0.5, Infinity), 0);
  assert.equal(resolveStrokePower(1000, 0.5, -10), 0);
});
