import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_COLORS, LONG_RAIL_SIGHTS, SHORT_RAIL_SIGHTS, poolBallSpec,
  createFeltTexture, createWalnutTexture, createBallTexture, createNumberTexture,
} from './poolVisuals.js';

test('American pool balls have exactly one non-striped 8 and unique numbered variants', () => {
  assert.equal(BALL_COLORS.length, 16);
  const specs = Array.from({ length: 16 }, (_, n) => poolBallSpec(n));
  assert.deepEqual(specs.map((s) => s.number), Array.from({ length: 16 }, (_, n) => n));
  assert.equal(specs[0].cue, true);
  assert.equal(specs[8].black, true);
  assert.equal(specs.filter((s) => s.striped).length, 7);
  assert.deepEqual(specs.filter((s) => s.striped).map((s) => s.number), [9,10,11,12,13,14,15]);
  for (const n of [-1, 16, 8.1, NaN]) assert.throws(() => poolBallSpec(n), RangeError);
});

test('rail diamonds are symmetric and never located inside a middle pocket', () => {
  assert.deepEqual([...LONG_RAIL_SIGHTS].reverse(), LONG_RAIL_SIGHTS.map((n) => -n));
  assert.deepEqual([...SHORT_RAIL_SIGHTS].reverse(), SHORT_RAIL_SIGHTS.map((n) => n === 0 ? 0 : -n));
  assert.ok(LONG_RAIL_SIGHTS.every((x) => Math.abs(x) > 0.5 && Math.abs(x) < 4));
});

// Lightweight canvas stub ensures all procedural effects work without a
// native WebGL/browser and do not rely on external URLs or runtime fetching.
function mockGraphics() {
  const actions = [];
  const ctx = {
    fillRect: (...args) => actions.push(['rect', ...args]),
    clearRect: (...args) => actions.push(['clear', ...args]),
    createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }),
    putImageData: (...args) => actions.push(['pixels', args[0].data.length]),
    createLinearGradient: () => ({
      addColorStop: (...args) => actions.push(['stop', ...args]),
    }),
    beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
    fillText: (value) => actions.push(['number', value]),
  };
  const documentRef = { createElement: () => ({
    getContext: () => ctx, width: 0, height: 0,
  }) };
  class CanvasTexture {
    constructor(canvas) { this.image = canvas; this.repeat = { set: (...n) => actions.push(['repeat', ...n]) }; }
  }
  const THREE = { CanvasTexture, SRGBColorSpace: 'sRGB', RepeatWrapping: 'repeat' };
  return { THREE, documentRef, actions };
}
test('felt/wood texture is bounded, deterministic canvas data; no external assets', () => {
  const g = mockGraphics();
  const felt = createFeltTexture(g.THREE, g.documentRef);
  const wood = createWalnutTexture(g.THREE, g.documentRef);
  assert.equal(felt.image.width, 256);
  assert.equal(wood.image.width, 512);
  assert.equal(felt.wrapS, 'repeat');
  assert.equal(wood.wrapS, 'repeat');
  assert.ok(g.actions.some((a) => a[0] === 'pixels' && a[1] === 256*256*4));
  assert.ok(g.actions.some((a) => a[0] === 'repeat' && a[1] === 7 && a[2] === 4));
});

test('numbered ball skins and cap labels are generated locally', () => {
  const g = mockGraphics();
  const striped = createBallTexture(g.THREE, 11, g.documentRef);
  const solid = createBallTexture(g.THREE, 3, g.documentRef);
  const number = createNumberTexture(g.THREE, 11, g.documentRef);
  assert.ok(striped.image.width === 512 && solid.image.width === 512);
  assert.equal(number.image.width, 256);
  assert.ok(g.actions.some((a) => a[0] === 'number' && a[1] === '11'));
  assert.equal(createNumberTexture(g.THREE, 0, g.documentRef), null);
});
