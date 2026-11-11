import test from 'node:test';
import assert from 'node:assert/strict';
import { createRack } from './physics.js';
import { adjudicateEightBallShot as judge, groupForBall, newEightBallMatch } from './eightBallRules.js';

const fresh = () => newEightBallMatch();
const before = (pocketed = []) => createRack().map((ball) => ({
  id: ball.id, pocketed: pocketed.includes(ball.id),
}));
const contact = (id) => [{ type: 'contact', a: 0, b: id }];
const rail = (id = 0) => [{ type: 'rail', id }];
const pot = (id, pocket = 1) => [{ type: 'potted', id, pocket }];
const regular = (match = fresh()) => ({ ...match, breakShot: false });
const assigned = (group = 'solids') => regular({
  ...fresh(), groups: [group, group === 'solids' ? 'stripes' : 'solids'],
});

test('referee starts with player one, open table and legal free break', () => {
  assert.equal(groupForBall(0), null);
  assert.equal(groupForBall(8), null);
  assert.equal(groupForBall(1), 'solids');
  assert.equal(groupForBall(15), 'stripes');
  assert.equal(groupForBall(16), null);
  assert.deepEqual(fresh().groups, [null, null]);
  const next = judge(fresh(), before(), [...contact(1), ...rail(1), ...rail(2), ...rail(3), ...rail(4)]);
  assert.equal(next.last.kind, 'pass');
  assert.equal(next.player, 1);
  assert.equal(next.breakShot, false);
});

test('break must reach a pocket or four unique object rails; scratches foul', () => {
  const soft = judge(fresh(), before(), [...contact(1), ...rail(1), ...rail(1), ...rail(2)]);
  assert.equal(soft.last.kind, 'foul');
  assert.equal(soft.ballInHand, true);
  assert.equal(soft.player, 1);
  const pocket = judge(fresh(), before(), [...contact(1), ...pot(1)]);
  assert.equal(pocket.last.kind, 'keep');
  assert.deepEqual(pocket.groups, [null, null], 'break never assigns groups');
  const scratched = judge(fresh(), before(), [...contact(1), ...pot(1), {type:'scratch',id:0}]);
  assert.equal(scratched.last.kind, 'foul');
  assert.equal(scratched.player, 1);
});

test('eight on break reracks, preserving turn unless scratched', () => {
  const eight = judge(fresh(), before(), [...contact(8), ...pot(8)]);
  assert.equal(eight.rerack, true);
  assert.equal(eight.player, 0);
  assert.equal(eight.winner, null);
  const scratched = judge(fresh(), before(), [...contact(8), ...pot(8), {type:'scratch',id:0}]);
  assert.equal(scratched.rerack, true);
  assert.equal(scratched.player, 1);
});

test('first clean single-group pot after break assigns opposite groups', () => {
  const matched = judge(regular(), before(), [...contact(10), ...pot(10)]);
  assert.deepEqual(matched.groups, ['stripes', 'solids']);
  assert.equal(matched.player, 0);
  const mixed = judge(regular(), before(), [...contact(1), ...pot(1), ...pot(9)]);
  assert.deepEqual(mixed.groups, [null,null]);
  assert.equal(mixed.player, 1);
  assert.equal(mixed.last.kind, 'pass');
  const scratched = judge(regular(), before(), [...contact(1), ...pot(1), {type:'scratch', id:0}]);
  assert.deepEqual(scratched.groups, [null,null], 'no assignment on foul');
});

test('legitimate group pots retain turn; misses pass; wrong first contact fouls', () => {
  const state = assigned();
  const keep = judge(state, before(), [...contact(1), ...pot(2)]);
  assert.equal(keep.last.kind, 'keep');
  assert.equal(keep.player, 0);
  const pass = judge(state, before(), [...contact(1), ...rail(0)]);
  assert.equal(pass.last.kind, 'pass');
  assert.equal(pass.player, 1);
  const foul = judge(state, before(), [...contact(9), ...rail(9)]);
  assert.equal(foul.last.kind, 'foul');
  assert.equal(foul.player, 1);
  assert.equal(foul.ballInHand, true);
  assert.deepEqual(state.groups, ['solids','stripes'], 'state immutable');
});

test('no first contact and no rail after contact are both fouls', () => {
  assert.equal(judge(regular(), before(), [...rail(0)]).last.kind, 'foul');
  assert.equal(judge(regular(), before(), [...rail(0), ...contact(1)]).last.kind, 'foul');
  assert.equal(judge(regular(), before(), [...contact(1), ...rail(1)]).last.kind, 'pass');
});

test('pocketing opponent object does not retain the turn', () => {
  const next = judge(assigned(), before(), [...contact(1), ...pot(9)]);
  assert.equal(next.last.kind, 'pass');
  assert.equal(next.player, 1);
});

test('first contact with eight when table open is a foul', () => {
  const result = judge(regular(), before(), [...contact(8), ...rail(8)]);
  assert.equal(result.last.kind, 'foul');
  assert.equal(result.ballInHand, true);
});

test('eight must be first after clearing group, and called into correct pocket', () => {
  const state = assigned('solids');
  const cleared = before([1,2,3,4,5,6,7]);
  assert.equal(judge(state, cleared, [...contact(8), ...pot(8,2)], {calledPocket:2}).winner, 0);
  assert.equal(judge(state, cleared, [...contact(8), ...pot(8,2)], {calledPocket:3}).winner, 1);
  assert.equal(judge(state, cleared, [...contact(8), ...pot(8,2)]).winner, 1);
  assert.equal(judge(state, cleared, [...contact(9), ...rail(9)]).last.kind, 'foul');
  assert.equal(judge(state, before(), [...contact(8), ...pot(8,2)], {calledPocket:2}).winner, 1);
});

test('eight potted alongside last group ball loses; scratch with eight loses', () => {
  const state = assigned('solids');
  const nearlyCleared = before([1,2,3,4,5,6]);
  const together = judge(state, nearlyCleared,
    [...contact(7), ...pot(7), ...pot(8,0)], {calledPocket:0});
  assert.equal(together.winner, 1);
  assert.equal(together.last.kind, 'loss');
  const scratch = judge(state, before([1,2,3,4,5,6,7]),
    [...contact(8), ...pot(8,0), {type:'scratch',id:0}], {calledPocket:0});
  assert.equal(scratch.winner, 1);
});

test('once a match ends no second decision or phantom shot is possible', () => {
  const state = assigned('solids');
  const won = judge(state, before([1,2,3,4,5,6,7]),
    [...contact(8), ...pot(8,2)], {calledPocket:2});
  assert.throws(() => judge(won, before(), [...contact(1)]), TypeError);
});
