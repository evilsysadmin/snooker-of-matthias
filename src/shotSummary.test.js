import test from 'node:test';
import assert from 'node:assert/strict';
import { describeShotSummary } from './shotSummary.js';

test('shot summary distinguishes a clean pot, multi-pot and miss', () => {
  assert.deepEqual(describeShotSummary({ pottedIds: [4] }), {
    kind: 'pot', label: 'EMBOCADA · +1', detail: 'una bola dentro',
  });
  assert.deepEqual(describeShotSummary({ pottedIds: [4, 12] }), {
    kind: 'multi', label: 'DOBLETE · +2', detail: '2 embocadas',
  });
  assert.deepEqual(describeShotSummary(), {
    kind: 'miss', label: 'SIN EMBOCAR', detail: 'ninguna bola dentro',
  });
});

test('shot summary gives an actual scratch precedence without losing pots', () => {
  assert.deepEqual(describeShotSummary({ pottedIds: [8, 15], scratch: true }), {
    kind: 'scratch', label: 'FALTA · blanca dentro · +2', detail: '2 embocadas',
  });
});

test('shot summary rejects malformed physics event data', () => {
  assert.throws(() => describeShotSummary({ pottedIds: [3, 3] }), TypeError);
  assert.throws(() => describeShotSummary({ pottedIds: [16] }), TypeError);
  assert.throws(() => describeShotSummary({ scratch: 'yes' }), TypeError);
});
