import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cueIdleGap, cueStrokePose, CUE_CONTACT_MS,
  CUE_RECOIL_MS, CUE_STROKE_DURATION_MS,
} from './cueMotion.js';

test('charge draws the *visual* cue further back but leaves its rest gap unchanged', () => {
  for (const power of [0, 0.25, 0.65, 1]) {
    const rest = cueIdleGap(power);
    assert.ok(rest >= 0.046 && rest <= 0.206);
    assert.ok(cueIdleGap(power, true) > rest);
    assert.equal(cueStrokePose(0, power).gap, rest);
  }
  assert.equal(cueIdleGap(-1), cueIdleGap(0));
  assert.equal(cueIdleGap(3), cueIdleGap(1));
  assert.equal(cueIdleGap(Number.NaN), cueIdleGap(0));
});

test('cue makes one physical-looking forward contact, recoil and quiet settle', () => {
  for (const power of [0.08, 0.55, 1]) {
    const rest = cueIdleGap(power);
    assert.deepEqual(cueStrokePose(0, power), { phase: 'forward', gap: rest, lift: 0 });
    assert.ok(cueStrokePose(12, power).gap > cueStrokePose(35, power).gap);
    assert.equal(cueStrokePose(CUE_CONTACT_MS, power).phase, 'recoil');
    assert.ok(Math.abs(cueStrokePose(CUE_CONTACT_MS, power).gap - 0.033) < 1e-12);
    assert.ok(cueStrokePose(87, power).gap > cueStrokePose(CUE_CONTACT_MS, power).gap);
    assert.equal(cueStrokePose(CUE_RECOIL_MS, power).phase, 'settle');
    assert.ok(cueStrokePose(CUE_RECOIL_MS, power).gap > rest);
    assert.ok(cueStrokePose(CUE_STROKE_DURATION_MS - 1, power).gap >= rest);
    assert.equal(cueStrokePose(CUE_STROKE_DURATION_MS, power), null);
    for (let ms = 0; ms < CUE_STROKE_DURATION_MS; ms += 5) {
      const pose = cueStrokePose(ms, power);
      assert.ok(Number.isFinite(pose.gap) && pose.gap >= 0.033 - 1e-12);
      assert.ok(pose.lift >= 0 && pose.lift <= 0.012);
    }
  }
});

test('reduced-motion and invalid time skip animation safely', () => {
  assert.equal(cueStrokePose(30, 0.75, true), null);
  assert.equal(cueStrokePose(-1, 0.75), null);
  assert.equal(cueStrokePose(NaN, 0.75), null);
  assert.equal(cueStrokePose(Infinity, 0.75), null);
  assert.equal(cueStrokePose(30, NaN).phase, 'forward');
});
