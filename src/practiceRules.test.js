import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_BALL_COUNT, createRack, stepPhysics } from './physics.js';
import { remainingObjectBalls, isTableCleared } from './practiceRules.js';

test('pool free practice starts with 15 unique numbered objects', () => {
  const balls = createRack();
  assert.equal(OBJECT_BALL_COUNT, 15);
  assert.equal(remainingObjectBalls(balls), 15);
  assert.equal(isTableCleared(balls), false);
});

test('every potted pool ball stays down after the shot', () => {
  const balls = createRack();
  const eight = balls.find((ball) => ball.id === 8);
  eight.pocketed = true;
  assert.equal(remainingObjectBalls(balls), 14);
  assert.equal(isTableCleared(balls), false);
  assert.equal(eight.pocketed, true, 'no snooker-style automatic respot');
});

test('pool table can be cleared deterministically without colour respotting', () => {
  const balls = createRack();
  for (const ball of balls) if (ball.id !== 0) ball.pocketed = true;
  assert.equal(remainingObjectBalls(balls), 0);
  assert.equal(isTableCleared(balls), true);
});

test('physical pocket event stays permanent in free practice', () => {
  const balls = createRack();
  const seven = balls.find((ball) => ball.id === 7);
  seven.x = -4.24;
  seven.z = 2.08;
  seven.vx = -0.2;
  const events = stepPhysics(balls, 1 / 120);
  assert.deepEqual(events.filter((event) => event.id === 7).map((event) => event.type),
    ['potted']);
  assert.equal(seven.pocketed, true);
  assert.equal(remainingObjectBalls(balls), 14);
});
