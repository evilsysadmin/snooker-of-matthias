import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUND_PREFERENCE_KEY, createFeedbackGate, createBilliardsAudio,
  readSoundEnabled, saveSoundEnabled,
} from './shotFeedback.js';

const hit = (type, speed) => ({ type, id: 1, a: 0, b: 1, impactSpeed: speed });

test('sound feedback uses actual impact speeds with noise floor and event cooldowns', () => {
  const gate = createFeedbackGate();
  assert.deepEqual(gate.consume([hit('contact', 0.1), hit('rail', 0.2)], 0), []);
  assert.deepEqual(gate.consume([hit('contact', 3.5), hit('contact', 1), hit('rail', 1.2)], 10),
    [{ type: 'contact', strength: 0.5 }], 'strongest measured collision wins');
  assert.deepEqual(gate.consume([hit('contact', 4)], 20), [], 'no contact barrage');
  assert.deepEqual(gate.consume([hit('contact', 7)], 77),
    [{ type: 'contact', strength: 1 }], 'later real contact is audible');
  assert.deepEqual(gate.consume([hit('rail', 3)], 80),
    [{ type: 'rail', strength: 3 / 7 }]);
  assert.deepEqual(gate.consume([hit('rail', 3)], 160), []);
  gate.reset();
  assert.deepEqual(gate.consume([hit('rail', 3)], 162),
    [{ type: 'rail', strength: 3 / 7 }]);
});

test('pocket and scratch sounds are distinct, never require collision intensity', () => {
  const gate = createFeedbackGate();
  assert.deepEqual(gate.consume([
    { type: 'potted', id: 1, pocket: 0 },
    { type: 'potted', id: 2, pocket: 1 },
    hit('contact', 9),
  ], 100), [{ type: 'potted', strength: 0.72 }, { type: 'contact', strength: 1 }]);
  assert.deepEqual(gate.consume([{ type: 'potted', id: 3, pocket: 2 }], 145), []);
  assert.deepEqual(gate.consume([
    { type: 'scratch', id: 0, pocket: 5 }, { type: 'potted', id: 4, pocket: 3 },
  ], 150), [{ type: 'scratch', strength: 0.72 }]);
  assert.deepEqual(gate.consume([], 200), []);
  assert.deepEqual(gate.consume(null, 300), []);
});

test('invalid/unmeasured contacts never create fictitious effects', () => {
  const gate = createFeedbackGate();
  assert.deepEqual(gate.consume([
    hit('contact', NaN), hit('rail', Infinity),
    { type: 'rail', id: 1 }, { type: 'contact', impactSpeed: -1 },
    null, 'noise',
  ], 300), []);
  assert.deepEqual(gate.consume([hit('contact', 100)], 300),
    [{ type: 'contact', strength: 1 }], 'clamp to bounded volume');
});

test('sound preference persists only a tiny local flag, never access tokens', () => {
  const map = new Map();
  const storage = () => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  });
  assert.equal(readSoundEnabled(storage), true);
  assert.equal(saveSoundEnabled(false, storage), true);
  assert.equal(readSoundEnabled(storage), false);
  assert.equal(map.get(SOUND_PREFERENCE_KEY), 'off');
  assert.equal(saveSoundEnabled(true, storage), true);
  assert.equal(map.get(SOUND_PREFERENCE_KEY), 'on');
  const blocked = () => { throw Error('SecurityError'); };
  assert.equal(readSoundEnabled(blocked), true);
  assert.equal(saveSoundEnabled(false, blocked), false);
});

test('WebAudio is lazy, strictly opt-in after user action, mute-safe and optional', () => {
  let created = 0, persisted = null;
  const audio = createBilliardsAudio({
    contextFactory: () => { created++; return null; },
    initialEnabled: true, persist: (value) => { persisted = value; },
  });
  audio.play('strike', 0.5);
  assert.equal(created, 0, 'no AudioContext or autoplay before user gesture');
  assert.equal(audio.isEnabled(), true);
  audio.setEnabled(false);
  assert.equal(persisted, false);
  assert.equal(audio.unlock(), false);
  audio.play('potted', 1);
  assert.equal(created, 0, 'mute skips all audio initialization');
  audio.setEnabled(true);
  assert.equal(persisted, true);
  assert.equal(created, 1, 'explicit sound button may attempt audio init');
  assert.doesNotThrow(() => audio.play('contact', 1), 'no audio hardware is safe');
});
