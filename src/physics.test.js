import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLE, BAULK, COLOUR_SPOTS, OBJECT_BALL_COUNT, createRack, ballsMoving, stepPhysics, strikeCue, respawnCue,
} from './physics.js';

test('snooker practice rack has 15 reds, 6 colours and one cue, without overlapping', () => {
  const balls = createRack();
  assert.equal(OBJECT_BALL_COUNT, 21);
  assert.equal(balls.length, OBJECT_BALL_COUNT + 1);
  assert.deepEqual([...balls.map((b) => b.id)].sort((a, b) => a - b),
    Array.from({ length: OBJECT_BALL_COUNT + 1 }, (_, i) => i));
  assert.equal(balls.filter((b) => b.id >= 1 && b.id <= 15).length, 15);
  assert.deepEqual(balls.filter((b) => b.id >= 16).map((b) => b.id), [16, 17, 18, 19, 20, 21]);
  assert.equal(COLOUR_SPOTS.length, 6);
  for (const spot of COLOUR_SPOTS) {
    const ball = balls.find((b) => b.id === spot.id);
    assert.ok(ball, `missing colour ${spot.id}`);
    assert.equal(ball.x, spot.x, `colour ${spot.id} x`);
    assert.equal(ball.z, spot.z, `colour ${spot.id} z`);
  }
  assert.ok(BAULK.x < 0 && BAULK.x > -TABLE.halfX, 'baulk line lies inside table');
  assert.ok(BAULK.radius > 0 && BAULK.radius < TABLE.halfZ, 'D fits inside cushion');
  assert.equal(COLOUR_SPOTS[0].z, BAULK.radius);
  assert.equal(COLOUR_SPOTS[1].z, -BAULK.radius);
  assert.equal(COLOUR_SPOTS[2].x, BAULK.x);
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

test('follow and draw visibly change the real white-ball motion after a head-on collision', () => {
  function play(followDraw) {
    const balls = [
      { id: 0, x: -0.8, z: 0, vx: 0, vz: 0, pocketed: false },
      { id: 1, x: 0, z: 0, vx: 0, vz: 0, pocketed: false },
    ];
    assert.equal(strikeCue(balls, 1, 0, 0.4, followDraw), true);
    for (let i = 0; i < 55; i++) stepPhysics(balls, 1 / 120);
    return balls;
  }
  const normal = play(0);
  const follow = play(1);
  const draw = play(-1);
  assert.ok(follow[0].vx > normal[0].vx + 0.35, 'topspin sends the white forward after contact');
  assert.ok(draw[0].vx < normal[0].vx - 0.35, 'backspin pulls the white backward after contact');
  assert.ok(draw[0].vx < 0, 'a draw shot actually reverses cue direction');
  for (const result of [normal, follow, draw]) {
    assert.ok(result.every((b) => Number.isFinite(b.x) && Number.isFinite(b.vx)));
    assert.ok(result[1].vx > 0, 'the object ball still receives the head-on strike');
  }
});

test('spin is bounded, neutral is identical to legacy and nonfinite spin is ignored', () => {
  const make = () => [
    { id: 0, x: -0.8, z: 0, vx: 0, vz: 0, pocketed: false },
    { id: 1, x: 0, z: 0, vx: 0, vz: 0, pocketed: false },
  ];
  const neutral = make(), omitted = make(), invalid = make(), bounded = make(), explicit = make();
  assert.ok(strikeCue(neutral, 1, 0, .4, 0));
  assert.ok(strikeCue(omitted, 1, 0, .4));
  assert.ok(strikeCue(invalid, 1, 0, .4, NaN));
  assert.ok(strikeCue(bounded, 1, 0, .4, 1000));
  assert.ok(strikeCue(explicit, 1, 0, .4, 1));
  for (let i = 0; i < 70; i++) {
    for (const set of [neutral, omitted, invalid, bounded, explicit]) stepPhysics(set, 1 / 120);
  }
  assert.deepEqual(neutral, omitted, 'default neutral remains backward-compatible');
  assert.deepEqual(neutral, invalid, 'non-finite spin must be safely neutral');
  assert.deepEqual(bounded, explicit, 'large input spin is clamped');
});

test('cue spin cannot survive a scratch or be applied to respawned white', () => {
  const balls = [
    { id: 0, x: 4.18, z: 2.05, vx: 0, vz: 0, spinVx: 2, spinVz: 1, pocketed: false },
  ];
  const events = stepPhysics(balls, 1 / 120);
  assert.equal(events[0].type, 'scratch');
  assert.equal(balls[0].spinVx, 0);
  assert.equal(balls[0].spinVz, 0);
  assert.equal(respawnCue(balls), true);
  assert.equal(balls[0].spinVx, 0);
  assert.equal(balls[0].spinVz, 0);
});
