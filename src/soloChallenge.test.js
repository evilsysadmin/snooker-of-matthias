import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOLO_BEST_KEY, newSoloChallenge, readSoloBest, saveSoloBest, settleSoloShot,
} from './soloChallenge.js';

const settle = (state, ids = [], scratch = false) =>
  settleSoloShot(state, { pottedIds: ids, scratch, remaining: state.remaining - ids.length });

test('solo challenge starts clean and never invents a personal best', () => {
  const s = newSoloChallenge();
  assert.equal(s.shots, 0);
  assert.equal(s.remaining, 15);
  assert.equal(s.potted, 0);
  assert.equal(s.scratches, 0);
  assert.equal(s.streak, 0);
  assert.equal(s.best, null);
  assert.equal(s.completed, false);
});

test('only actual potted balls increment stats; misses reset streak', () => {
  let s = newSoloChallenge();
  s = settle(s, [1]);
  assert.deepEqual([s.shots,s.potted,s.remaining,s.streak,s.last.kind], [1,1,14,1,'pot']);
  s = settle(s, [2,3]);
  assert.deepEqual([s.shots,s.potted,s.remaining,s.streak,s.last.kind], [2,3,12,2,'multi']);
  s = settle(s);
  assert.deepEqual([s.shots,s.potted,s.remaining,s.streak,s.bestStreak,s.last.kind],
    [3,3,12,0,2,'miss']);
});

test('scratch is recorded even if a ball drops and breaks clean streak', () => {
  let s = settle(newSoloChallenge(), [1]);
  s = settle(s, [2], true);
  assert.deepEqual([s.potted,s.scratches,s.streak,s.last.kind], [2,1,0,'scratch']);
  assert.equal(s.remaining, 13);
});

test('clearing 15 balls declares completion and an earned new record', () => {
  let s = newSoloChallenge();
  for (let i=1;i<=15;i++) s = settle(s, [i]);
  assert.equal(s.completed, true);
  assert.equal(s.record, true);
  assert.deepEqual(s.best, { shots: 15, scratches: 0 });
  assert.equal(s.last.kind, 'cleared');
  assert.throws(() => settle(s), TypeError, 'cannot farm shots after the rack is cleared');
  const restarted = newSoloChallenge(s.best);
  assert.equal(restarted.shots, 0);
  assert.equal(restarted.remaining, 15);
  assert.deepEqual(restarted.best, s.best);
});

test('fewest real shots wins; scratches break ties; worse runs do not overwrite best', () => {
  const old = { shots: 8, scratches: 2 };
  const finish = (best, missCount, scratches = 0) => {
    let s = newSoloChallenge(best);
    for(let i=0;i<missCount;i++) s = settle(s, [], i < scratches);
    return settle(s, Array.from({ length: 15 }, (_, i) => i + 1));
  };
  assert.deepEqual(finish(old, 6).best, {shots: 7, scratches: 0});
  assert.deepEqual(finish(old, 7, 1).best, {shots: 8, scratches: 1});
  const worse = finish(old, 7, 3);
  assert.deepEqual(worse.best, old);
  assert.equal(worse.record, false);
});

test('cannot forge duplicate, non-potted or impossible physics events', () => {
  const s = newSoloChallenge();
  const invalid = [
    { pottedIds: [1,1], remaining: 13 },
    { pottedIds: [16], remaining: 14 },
    { pottedIds: [0], remaining: 14 },
    { pottedIds: [1], remaining: 15 },
    { pottedIds: [], remaining: 14 },
    { pottedIds: [], remaining: -1 },
    { pottedIds: [], remaining: 16 },
    { pottedIds: [], remaining: 15, scratch: 'false' },
  ];
  for (const arg of invalid) assert.throws(() => settleSoloShot(s,arg),TypeError);
  assert.equal(s.shots, 0, 'state is immutable on errors');
});

test('local best reads only versioned and bounded data, never random old keys', () => {
  const storage = new Map();
  const provider = () => ({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key,value) => storage.set(key,value),
  });
  assert.equal(readSoloBest(provider), null);
  assert.equal(saveSoloBest({shots: 12,scratches: 1},provider),true);
  assert.deepEqual(readSoloBest(provider),{shots:12,scratches:1});
  assert.ok(storage.has(SOLO_BEST_KEY));
  for (const payload of [
    'broken', '{}', '{"version":2,"shots":12,"scratches":1}',
    '{"version":1,"shots":-1,"scratches":0}',
    '{"version":1,"shots":12,"scratches":13}',
    '{"version":1,"shots":1.5,"scratches":0}',
  ]) {
    storage.set(SOLO_BEST_KEY,payload);
    assert.equal(readSoloBest(provider),null);
  }
});

test('blocked localStorage degrades safely; invalid saves cannot poison best', () => {
  const broken = () => { throw Error('SecurityError'); };
  assert.equal(readSoloBest(broken),null);
  assert.equal(saveSoloBest({shots:12,scratches:0},broken),false);
  let called = false;
  assert.equal(saveSoloBest({shots:0,scratches:0},() => {
    called = true;
    throw Error('should never access storage');
  }),false);
  assert.equal(called,false);
});
