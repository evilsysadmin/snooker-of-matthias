import test from 'node:test';
import assert from 'node:assert/strict';
import { createRack, strikeCue, stepPhysics } from './physics.js';
import { savePracticeShot, restorePracticeShot } from './practiceUndo.js';

test('undo reconstructs exact pre-shot positions, velocities, counters and input state', () => {
  const balls = createRack();
  const before = structuredClone(balls);
  const snapshot = savePracticeShot({
    balls, shots: 3, potted: 2, aimX: 0.8, aimZ: 0.6,
    fineAimSteps: -2, cueSpin: -1, power: 67,
  });
  assert.notStrictEqual(snapshot.balls[0], balls[0]);
  assert.equal(strikeCue(balls, 1, 0, 0.67, -1), true);
  for (let i = 0; i < 120; i++) stepPhysics(balls, 1 / 120);
  balls[1].pocketed = true;
  const restored = restorePracticeShot(snapshot);
  assert.deepEqual(restored.balls, before);
  assert.deepEqual(
    { shots: restored.shots, potted: restored.potted, aimX: restored.aimX,
      aimZ: restored.aimZ, fineAimSteps: restored.fineAimSteps,
      cueSpin: restored.cueSpin, power: restored.power },
    { shots: 3, potted: 2, aimX: 0.8, aimZ: 0.6, fineAimSteps: -2,
      cueSpin: -1, power: 67 },
  );
  restored.balls[0].vx = 999;
  assert.deepEqual(restorePracticeShot(snapshot).balls, before,
    'reusing the snapshot cannot inherit changes from a restored run');
});

test('reshooting an undone practice position reproduces the deterministic physics', () => {
  const snapshot = savePracticeShot({
    balls: createRack(), shots: 0, potted: 0,
    aimX: 1, aimZ: 0, fineAimSteps: 0, cueSpin: 1, power: 55,
  });
  function play() {
    const { balls } = restorePracticeShot(snapshot);
    assert.ok(strikeCue(balls, 1, 0, 0.55, 1));
    for (let i = 0; i < 260; i++) stepPhysics(balls, 1 / 120);
    return balls;
  }
  assert.deepEqual(play(), play(), 'same saved setup yields identical results');
});
