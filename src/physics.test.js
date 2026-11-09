import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLE, OBJECT_BALL_COUNT, createRack, ballsMoving, stepPhysics, strikeCue, respawnCue,
} from './physics.js';

test('snooker practice rack has 15 reds, 6 colours and one cue, without overlapping', () => {
  const balls = createRack();
  assert.equal(OBJECT_BALL_COUNT, 21);
  assert.equal(balls.length, OBJECT_BALL_COUNT + 1);
  assert.deepEqual([...balls.map((b) => b.id)].sort((a, b) => a - b),
    Array.from({ length: OBJECT_BALL_COUNT + 1 }, (_, i) => i));
  assert.equal(balls.filter((b) => b.id >= 1 && b.id <= 15).length, 15);
  assert.deepEqual(balls.filter((b) => b.id >= 16).map((b) => b.id), [16, 17, 18, 19, 20, 21]);
  assert.equal(balls.find((b) => b.id === 19).x, 0, 'blue is centred');
  assert.ok(balls.find((b) => b.id === 20).x < balls.find((b) => b.id === 1).x,
    'pink stands before red triangle');
  assert.ok(balls.find((b) => b.id === 21).x > balls.find((b) => b.id === 15).x,
    'black stands behind the red triangle');
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      assert.ok(Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z)
        >= TABLE.ballRadius * 2 - 1e-9);
    }
  }
});

test('a shot moves the cue, cannot be fired twice while rolling, and stops with friction', () => {
  const balls = createRack();
  assert.equal(strikeCue(balls, 1, 0, 0.35), true);
  assert.equal(strikeCue(balls, 0, 1, 0.35), false);
  assert.equal(ballsMoving(balls), true);
  for (let i = 0; i < 3500; i++) stepPhysics(balls, 1 / 120);
  assert.equal(ballsMoving(balls), false);
});

test('a head-on collision transfers momentum rather than ghosting through', () => {
  const balls = [
    { id: 0, x: -(TABLE.ballRadius * 2 + 0.01), z: 0, vx: 4, vz: 0, pocketed: false },
    { id: 1, x: 0, z: 0, vx: 0, vz: 0, pocketed: false },
  ];
  stepPhysics(balls, 1 / 120);
  assert.ok(balls[1].vx > 3.5);
  assert.ok(balls[0].vx < 0.3);
});

test('corner pockets swallow objects and the cue ball without a wall rebound', () => {
  const balls = [
    { id: 0, x: -4.16, z: 2.05, vx: -0.5, vz: 0, pocketed: false },
    { id: 1, x: 4.18, z: -2.04, vx: 0, vz: 0, pocketed: false },
  ];
  const events = stepPhysics(balls, 1 / 120);
  assert.deepEqual(events.map((e) => e.type).sort(), ['potted', 'scratch']);
  assert.ok(balls.every((b) => b.pocketed));
});

test('cushions reflect away from pockets', () => {
  const balls = [{ id: 0, x: TABLE.halfX - TABLE.ballRadius - 0.01, z: 0.4, vx: 3, vz: 0, pocketed: false }];
  stepPhysics(balls, 1 / 120);
  assert.ok(balls[0].vx < 0);
  assert.equal(balls[0].pocketed, false);
});

test('scratched cue is restored only once all the other balls stop', () => {
  const balls = createRack();
  const cue = balls[0];
  cue.pocketed = true;
  balls[1].vx = 1;
  assert.equal(respawnCue(balls), false);
  balls[1].vx = 0;
  assert.equal(respawnCue(balls), true);
  assert.equal(cue.pocketed, false);
  assert.equal(cue.vx, 0);
});

test('physics rejects variable steps that would tunnel through collisions', () => {
  assert.throws(() => stepPhysics(createRack(), 0.5), RangeError);
});

test('zero charge does not produce a shot or move the cue', () => {
  const balls = createRack();
  assert.equal(strikeCue(balls, 1, 0, 0), false);
  assert.equal(balls[0].vx, 0);
  assert.equal(ballsMoving(balls), false);
});
