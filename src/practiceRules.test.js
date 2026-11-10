import test from 'node:test';
import assert from 'node:assert/strict';
import { BAULK, COLOUR_SPOTS, TABLE, createRack, stepPhysics } from './physics.js';
import { redsOnTable, remainingObjectBalls, respotPracticeColours } from './practiceRules.js';

const spotFor = (id) => COLOUR_SPOTS.find((spot) => spot.id === id);
const pocket = (balls, id) => {
  const ball = balls.find((b) => b.id === id);
  ball.pocketed = true;
  ball.vx = 0;
  ball.vz = 0;
  return ball;
};
const separated = (balls) => {
  for (let i = 0; i < balls.length; i++) {
    if (balls[i].pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      if (balls[j].pocketed) continue;
      assert.ok(Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z)
        >= 2 * TABLE.ballRadius - 1e-9,
      `overlap between ${balls[i].id} and ${balls[j].id}`);
    }
  }
};

test('colour pot while reds remain restores on its own spot only after rest', () => {
  const balls = createRack();
  const yellow = pocket(balls, 16);
  const cue = balls[0];
  cue.vx = 0.4;
  assert.equal(redsOnTable(balls), true);
  assert.deepEqual(respotPracticeColours(balls), [], 'never respot during rolling');
  assert.equal(yellow.pocketed, true);
  cue.vx = 0;
  const restored = respotPracticeColours(balls);
  assert.deepEqual(restored.map((entry) => ({ id: entry.id, location: entry.location })),
    [{ id: 16, location: 'own' }]);
  assert.equal(yellow.pocketed, false);
  assert.equal(yellow.x, spotFor(16).x);
  assert.equal(yellow.z, spotFor(16).z);
  assert.equal(remainingObjectBalls(balls), 21, 'potted and returned colours remain on table');
  assert.deepEqual(respotPracticeColours(balls), [], 'a settled frame never duplicates respots');
});

test('occupied home spot uses highest vacant colour spot, never overlaps', () => {
  const balls = createRack();
  const black = pocket(balls, 21);
  // The cue blocks the black mark; the pink and blue have also moved
  // away from their marks and are not themselves pocketed.
  balls[0].x = spotFor(21).x;
  balls[0].z = spotFor(21).z;
  balls.find((b) => b.id === 20).x = 0.8;
  balls.find((b) => b.id === 19).x = -0.65;
  const result = respotPracticeColours(balls);
  assert.deepEqual(result.map((entry) => [entry.id, entry.location]), [[21, 'other']]);
  assert.equal(black.x, spotFor(20).x, 'fallback is the highest vacant mark');
  assert.equal(black.z, spotFor(20).z);
  separated(balls);
});

test('all colour marks blocked: nearest free line position avoids overlap', () => {
  const balls = createRack();
  const pink = pocket(balls, 20);
  const spot = spotFor(20);
  // Preserve the other colour marks as occupied, and block pink's own mark.
  balls[0].x = spot.x;
  balls[0].z = spot.z;
  const result = respotPracticeColours(balls);
  assert.deepEqual(result.map((entry) => [entry.id, entry.location]), [[20, 'line']]);
  assert.equal(pink.pocketed, false);
  assert.equal(pink.z, spot.z);
  assert.ok(Math.abs(pink.x - spot.x) > 2 * TABLE.ballRadius,
    'search must step clear of the ball obstructing the mark');
  separated(balls);
});

test('two colours respot in value order and never claim an occupied mark', () => {
  const balls = createRack();
  const pink = pocket(balls, 20);
  const black = pocket(balls, 21);
  balls[0].x = spotFor(21).x;
  balls[0].z = spotFor(21).z;
  const result = respotPracticeColours(balls);
  assert.deepEqual(result.map((event) => event.id), [21, 20]);
  assert.equal(black.pocketed, false);
  assert.equal(pink.pocketed, false);
  assert.equal(black.x, spotFor(20).x);
  assert.notEqual(pink.x, spotFor(20).x, 'second colour cannot claim occupied mark');
  separated(balls);
});

test('no reds left: colours stay down, making 21-object clearance possible', () => {
  const balls = createRack();
  for (let id = 1; id <= 15; id++) pocket(balls, id);
  const yellow = pocket(balls, 16);
  assert.equal(redsOnTable(balls), false);
  assert.equal(remainingObjectBalls(balls), 5);
  assert.deepEqual(respotPracticeColours(balls), []);
  assert.equal(yellow.pocketed, true);
  for (let id = 17; id <= 21; id++) pocket(balls, id);
  assert.equal(remainingObjectBalls(balls), 0);
  assert.deepEqual(respotPracticeColours(balls), [], 'a completed board stays cleared');
});

test('last red and a colour potted in one shot stay down together', () => {
  const balls = createRack();
  for (let id = 2; id <= 15; id++) pocket(balls, id);
  pocket(balls, 1);
  const blue = pocket(balls, 19);
  assert.deepEqual(respotPracticeColours(balls), []);
  assert.equal(blue.pocketed, true);
  assert.equal(remainingObjectBalls(balls), 5);
});

test('pocket detection remains physical; restoring after an actual collision is deterministic', () => {
  const balls = createRack();
  const yellow = balls.find((b) => b.id === 16);
  yellow.x = -4.24;
  yellow.z = 2.08;
  yellow.vx = -0.2;
  const events = stepPhysics(balls, 1 / 120);
  assert.deepEqual(events.filter((event) => event.id === 16).map((event) => event.type),
    ['potted']);
  assert.equal(yellow.pocketed, true);
  const restored = respotPracticeColours(balls);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, 16);
  assert.equal(yellow.pocketed, false);
  assert.equal(yellow.x, BAULK.x);
  assert.equal(yellow.z, spotFor(16).z);
});
