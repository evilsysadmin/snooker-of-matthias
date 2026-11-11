import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLE, CUE_START, RACK_APEX, POCKETS, POCKET_JAWS, OBJECT_BALL_COUNT, createRack, ballsMoving, stepPhysics, strikeCue, respawnCue, canPlaceCueOnTable,
} from './physics.js';

test('American 8-ball has fifteen numbered balls and centred white without overlap', () => {
  const balls = createRack();
  assert.equal(OBJECT_BALL_COUNT, 15);
  assert.equal(balls.length, OBJECT_BALL_COUNT + 1);
  assert.deepEqual([...balls.map((ball) => ball.id)].sort((x, y) => x - y),
    Array.from({ length: OBJECT_BALL_COUNT + 1 }, (_, id) => id));
  const cue = balls.find((ball) => ball.id === 0);
  assert.deepEqual([cue.x, cue.z], [CUE_START.x, 0], 'white centered on head string');
  const eight = balls.find((ball) => ball.id === 8);
  const apex = balls.find((ball) => ball.id === 1);
  assert.deepEqual([apex.x, apex.z], [RACK_APEX.x, 0]);
  const gap = 2 * TABLE.ballRadius + 0.006;
  assert.ok(Math.abs(eight.x - (RACK_APEX.x + gap * Math.sqrt(3))) < 1e-9);
  assert.equal(eight.z, 0, 'eight sits at the centre of the third row');
  const lastRowX = RACK_APEX.x + 4 * gap * Math.sqrt(3) / 2;
  const corners = balls.filter((ball) => Math.abs(ball.x - lastRowX) < 1e-9 &&
    Math.abs(ball.z) > gap * 1.9).map((ball) => ball.id).sort((x,y) => x-y);
  assert.deepEqual(corners, [7,9], 'opposite back corners are solid and stripe');
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      assert.ok(Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z)
        >= 2 * TABLE.ballRadius - 1e-9, 'pool balls must not overlap');
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
    { id: 0, x: -4.23, z: 2.07, vx: -0.5, vz: 0, pocketed: false },
    { id: 1, x: 4.23, z: -2.07, vx: 0, vz: 0, pocketed: false },
  ];
  const events = stepPhysics(balls, 1 / 120);
  assert.deepEqual(events.map((e) => e.type).sort(), ['potted', 'scratch']);
  assert.ok(balls.every((b) => b.pocketed));
});


test('pool-size balls, head spot and rack remain inside table', () => {
  const visualBallRatio = (2 * TABLE.ballRadius / (2 * TABLE.halfZ)) / (57.15 / 1270);
  assert.ok(visualBallRatio > 0.85 && visualBallRatio < 1.2);
  assert.ok(CUE_START.x < 0 && RACK_APEX.x > 0);
  assert.ok(Math.abs(CUE_START.x) < TABLE.halfX - TABLE.ballRadius);
  assert.ok(Math.abs(RACK_APEX.x) < TABLE.halfX - TABLE.ballRadius);
  assert.equal(CUE_START.z, 0);
});

test('corner and middle pocket physics use the same mouths rendered in 3D', () => {
  assert.equal(POCKETS.length, 6);
  for (const [x, z, radius] of POCKETS) {
    assert.ok(Math.abs(x) > 4 || x === 0);
    assert.ok(Math.abs(z) >= TABLE.halfZ);
    assert.equal(radius, x === 0 ? TABLE.middlePocketRadius : TABLE.pocketRadius);
    assert.ok(radius < 3 * TABLE.ballRadius,
      'mouth must not swallow balls from an implausibly large distance');
  }
  assert.ok(TABLE.middlePocketRadius > TABLE.pocketRadius);
});

test('straight middle-pocket approaches pot while off-centre grazes bounce off cushion', () => {
  for (const sign of [-1, 1]) {
    const centered = [{
      id: 1, x: 0, z: sign * 1.98, vx: 0, vz: sign * 3, pocketed: false,
    }];
    const events = stepPhysics(centered, 1 / 120);
    assert.deepEqual(events.map((event) => event.type), ['potted']);
    assert.equal(centered[0].pocketed, true);
    assert.equal(centered[0].vz, 0);

    const grazing = [{
      id: 1, x: 0.24, z: sign * 1.9, vx: 0, vz: sign * 3, pocketed: false,
    }];
    let potted = 0;
    for (let i = 0; i < 45; i++) {
      potted += stepPhysics(grazing, 1 / 120).filter((event) => event.type === 'potted').length;
    }
    assert.equal(potted, 0, 'ball outside the actual mouth should not disappear');
    assert.equal(grazing[0].pocketed, false);
    assert.ok(grazing[0].vz * sign < 0, 'near miss must really bounce back');
  }
});

test('glancing corner approach misses the now tighter pocket and reflects', () => {
  const ball = { id: 1, x: 4.15, z: 1.9, vx: 3, vz: 0, pocketed: false };
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...stepPhysics([ball], 1 / 120));
  assert.deepEqual(events, []);
  assert.equal(ball.pocketed, false);
  // A rounded shoulder may redirect the miss along the other axis rather
  // than reversing x. What matters is an actual rejection away from the hole.
  const startDistance = Math.hypot(4.33 - 4.15, 2.15 - 1.9);
  const endDistance = Math.hypot(4.33 - ball.x, 2.15 - ball.z);
  assert.ok(endDistance > startDistance + 0.1,
    'a miss must be deflected away from the corner rather than leaking through');
});

test('every pocket has two mirrored rounded jaws inside the playable table', () => {
  assert.equal(POCKET_JAWS.length, POCKETS.length * 2);
  for (const jaw of POCKET_JAWS) {
    assert.equal(jaw.radius, TABLE.jawRadius);
    assert.ok(Number.isFinite(jaw.railX) && Number.isFinite(jaw.railZ),
      'visible shoulder must have a physical jaw-to-rail anchor');
    const joinLength = Math.hypot(jaw.railX - jaw.x, jaw.railZ - jaw.z);
    assert.ok(joinLength >= 0.08 && joinLength <= 0.17,
      'rounded shoulders join the existing rail without extended floating pieces');
    assert.ok(Math.abs(jaw.x) < TABLE.halfX);
    assert.ok(Math.abs(jaw.z) < TABLE.halfZ);
    assert.ok(POCKET_JAWS.some((other) =>
      Math.abs(other.x + jaw.x) < 1e-9 && Math.abs(other.z + jaw.z) < 1e-9),
    'shoulders must be mirror-symmetric at all pockets');
  }
});

test('a clean diagonal shot can enter each of the four corner mouths', () => {
  // Previously every such trajectory struck a jaw before pocket capture.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const dx = 4.33 - 3.75, dz = 2.15 - 1.55;
    const length = Math.hypot(dx, dz);
    const ball = {
      id: 1, x: sx * 3.75, z: sz * 1.55,
      vx: sx * 3 * dx / length, vz: sz * 3 * dz / length,
      pocketed: false,
    };
    const events = [];
    for (let i = 0; i < 120 && !ball.pocketed; i++) {
      events.push(...stepPhysics([ball], 1 / 120));
    }
    assert.equal(ball.pocketed, true, `clean corner ${sx}, ${sz} must be reachable`);
    const pocket = sx < 0 ? (sz < 0 ? 0 : 3) : (sz < 0 ? 2 : 5);
    assert.deepEqual(events, [{ type: 'potted', id: 1, pocket }]);
  }
});

test('a grazing shot at each middle-pocket shoulder is really rejected', () => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const jaw = POCKET_JAWS.find((item) =>
      Math.sign(item.x) === sx && Math.sign(item.z) === sz && Math.abs(item.x) < 1);
    assert.ok(jaw);
    const ball = {
      id: 1, x: jaw.x - sx * 0.03,
      z: jaw.z - sz * (TABLE.ballRadius + jaw.radius + 0.01),
      vx: 0, vz: sz * 3, pocketed: false,
    };
    const events = stepPhysics([ball], 1 / 120);
    assert.deepEqual(events, []);
    assert.equal(ball.pocketed, false);
    assert.ok(ball.vz * sz < 0, 'the jaw must reflect the incoming ball');
  }
});

test('the two kinds of corner jaw reject glancing shots without swallowing balls', () => {
  for (const signX of [-1, 1]) for (const signZ of [-1, 1]) {
    const jaws = POCKET_JAWS.filter((jaw) =>
      Math.sign(jaw.x) === signX && Math.sign(jaw.z) === signZ && Math.abs(jaw.x) > 3);
    assert.equal(jaws.length, 2);
    const longRailJaw = jaws.find((jaw) => Math.abs(jaw.x) < TABLE.halfX - 0.1);
    const shortRailJaw = jaws.find((jaw) => Math.abs(jaw.x) > TABLE.halfX - 0.1);
    assert.ok(longRailJaw && shortRailJaw);
    const towardsLong = [{
      id: 1, x: longRailJaw.x,
      z: longRailJaw.z - signZ * (TABLE.ballRadius + longRailJaw.radius + 0.01),
      vx: 0, vz: signZ * 3, pocketed: false,
    }];
    assert.deepEqual(stepPhysics(towardsLong, 1 / 120), []);
    assert.ok(towardsLong[0].vz * signZ < 0);
    const towardsShort = [{
      id: 1, x: shortRailJaw.x - signX * (TABLE.ballRadius + shortRailJaw.radius + 0.01),
      z: shortRailJaw.z, vx: signX * 3, vz: 0, pocketed: false,
    }];
    assert.deepEqual(stepPhysics(towardsShort, 1 / 120), []);
    assert.ok(towardsShort[0].vx * signX < 0);
  }
});

test('a centered middle-pocket ball is never blocked by the new jaw geometry', () => {
  for (const side of [-1, 1]) {
    const ball = { id: 1, x: 0, z: side * 1.88, vx: 0, vz: side * 3, pocketed: false };
    const events = [];
    for (let i = 0; i < 20 && !ball.pocketed; i++) {
      events.push(...stepPhysics([ball], 1 / 120));
    }
    assert.deepEqual(events.map((event) => event.type), ['potted']);
    assert.equal(ball.pocketed, true);
  }
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


test('pool ball-in-hand accepts any vacant table location when stopped', () => {
  const balls = createRack();
  const cue = balls[0];
  cue.pocketed = true;
  assert.equal(canPlaceCueOnTable(balls, -3, 0), true);
  assert.equal(canPlaceCueOnTable(balls, 0, -1.2), true, 'not restricted to the D');
  for (const [x, z] of [
    [TABLE.halfX, 0], [0, TABLE.halfZ], [NaN, 0], [Infinity, 0],
    [RACK_APEX.x, 0],
  ]) assert.equal(canPlaceCueOnTable(balls, x, z), false);
  balls[1].x = -3;
  balls[1].z = 0;
  assert.equal(canPlaceCueOnTable(balls, -3, 0), false, 'cannot overlap');
  assert.equal(respawnCue(balls, -3, 0), false);
  balls[1].vx = 0.2;
  assert.equal(canPlaceCueOnTable(balls, -2.9, -0.3), false, 'wait until still');
  balls[1].vx = 0;
  cue.spinVx = 3;
  assert.equal(respawnCue(balls, 0, -1.2), true);
  assert.deepEqual([cue.x, cue.z], [0, -1.2]);
  assert.equal(cue.pocketed, false);
  assert.equal(cue.spinVx, 0);
  assert.equal(respawnCue(balls, -3, 0), false, 'cannot move a live cue');
});

test('keyboard ball-in-hand fallback avoids occupied head spot', () => {
  const balls = createRack();
  const cue = balls[0];
  cue.pocketed = true;
  balls[1].x = CUE_START.x;
  balls[1].z = CUE_START.z;
  balls[1].vx = 1;
  assert.equal(respawnCue(balls), false, 'cannot place while moving');
  balls[1].vx = 0;
  assert.equal(respawnCue(balls), true);
  assert.ok(Math.abs(cue.x) < TABLE.halfX - TABLE.ballRadius);
  assert.ok(Math.hypot(cue.x - balls[1].x, cue.z - balls[1].z) >= 2 * TABLE.ballRadius);
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
    { id: 0, x: 4.23, z: 2.08, vx: 0, vz: 0, spinVx: 2, spinVz: 1, pocketed: false },
  ];
  const events = stepPhysics(balls, 1 / 120);
  assert.equal(events[0].type, 'scratch');
  assert.equal(balls[0].spinVx, 0);
  assert.equal(balls[0].spinVz, 0);
  assert.equal(respawnCue(balls), true);
  assert.equal(balls[0].spinVx, 0);
  assert.equal(balls[0].spinVz, 0);
});

test('optional shot telemetry records cue first contact without changing legacy simulation', () => {
  const balls = [
    { id: 0, x: -(TABLE.ballRadius * 2 + 0.01), z: 0, vx: 4, vz: 0, pocketed: false },
    { id: 1, x: 0, z: 0, vx: 0, vz: 0, pocketed: false },
  ];
  const events = stepPhysics(balls, 1 / 120, { trackContacts: true });
  const contacts = events.filter((event) => event.type === 'contact');
  assert.equal(contacts.length, 1);
  assert.deepEqual([contacts[0].a, contacts[0].b], [0, 1]);
  assert.ok(contacts[0].impactSpeed > 3, 'measured collision speed, not invented');
  assert.ok(balls[1].vx > 3.5);
});

test('rail telemetry counts only incoming collisions, not travel along cushion', () => {
  const ball = {
    id: 6, x: TABLE.halfX - TABLE.ballRadius - 0.001, z: 0.33,
    vx: 2, vz: 0, pocketed: false,
  };
  const events = stepPhysics([ball], 1 / 120, { trackContacts: true });
  const railEvents = events.filter((event) => event.type === 'rail');
  assert.equal(railEvents.length, 1);
  assert.equal(railEvents[0].id, 6);
  assert.ok(railEvents[0].impactSpeed > 1.8, 'incoming speed is recorded before rebound');
  assert.ok(ball.vx < 0);
  const second = stepPhysics([ball], 1 / 120, { trackContacts: true });
  assert.deepEqual(second.filter((event) => event.type === 'rail'), []);
});

test('pocket telemetry records exact pocket index for future called-eight rules', () => {
  const balls = [{ id: 8, x: 4.32, z: 2.12, vx: 0, vz: 0, pocketed: false }];
  const events = stepPhysics(balls, 1 / 120, { trackContacts: true });
  assert.deepEqual(events, [{ type: 'potted', id: 8, pocket: 5 }]);
});

test('contact and rail telemetry are opt-in; existing callers stay compatible', () => {
  const balls = [
    { id: 0, x: -(TABLE.ballRadius * 2 + 0.01), z: 0, vx: 4, vz: 0, pocketed: false },
    { id: 1, x: 0, z: 0, vx: 0, vz: 0, pocketed: false },
  ];
  const events = stepPhysics(balls, 1 / 120);
  assert.deepEqual(events, []);
});

test('impact telemetry is not affected by elasticity or audio preferences', () => {
  const cue = {
    id: 0, x: -(2 * TABLE.ballRadius + 0.009), z: 0, vx: 1.5, vz: 0,
    pocketed: false,
  };
  const ball = { id: 3, x: 0, z: 0, vx: 0, vz: 0, pocketed: false };
  const tracked = stepPhysics([cue, ball], 1 / 120, { trackContacts: true });
  const hit = tracked.find((event) => event.type === 'contact');
  assert.ok(hit && Number.isFinite(hit.impactSpeed));
  assert.ok(hit.impactSpeed > 1 && hit.impactSpeed < 2);
  assert.deepEqual(tracked.filter((event) => event.type === 'potted'), []);
});
