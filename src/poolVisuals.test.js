import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_COLORS, CUE_BALL_MARKER, TOP_CAMERA_FILL, PRECISION_ZOOM, MIN_PRECISION_ZOOM, MAX_PRECISION_ZOOM, adjustPrecisionZoom, precisionFocus, panPrecisionFocus, zoomPrecisionFocusAtPoint, followPrecisionFocus, STRIPE_IVORY, LONG_RAIL_SIGHTS, SHORT_RAIL_SIGHTS, poolBallSpec,
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

test('tight orthographic framing magnifies the whole table without clipping its rails', () => {
  assert.ok(TOP_CAMERA_FILL >= 0.95 && TOP_CAMERA_FILL <= 0.975,
    'the table should use almost the whole viewport but keep its six pockets in frame');
  const desktopWidth = 1198, desktopHeight = 424;
  const heightWorld = Math.max(2.51 / TOP_CAMERA_FILL,
    4.75 / ((desktopWidth / desktopHeight) * TOP_CAMERA_FILL));
  const projectedWidth = 9.5 * desktopHeight / (2 * heightWorld);
  assert.ok(projectedWidth / desktopWidth > 0.6,
    'a short laptop should display a large tabletop, rather than giant side gutters');
});

test('precision zoom focuses the real cue-to-target segment, leaving physics untouched', () => {
  assert.ok(PRECISION_ZOOM > 1.25 && PRECISION_ZOOM <= 1.5);
  const focus = precisionFocus({ x: -2.4, z: 0 }, { x: 2.05, z: 0 });
  assert.ok(Math.abs(focus.x + 0.175) < 1e-10);
  assert.equal(focus.z, 0);
  assert.deepEqual(precisionFocus({ x: -2.4, z: 1.6 }, null), { x: -2.4, z: 1.6 });
  assert.deepEqual(precisionFocus(null, null), { x: 0, z: 0 });
  assert.ok(PRECISION_ZOOM * TOP_CAMERA_FILL > 1,
    'the close-up is opt-in; full table remains the default');
});

test('graduated optical zoom is discrete, clamped and deterministic', () => {
  assert.equal(adjustPrecisionZoom(PRECISION_ZOOM, 1), 1.5);
  assert.equal(adjustPrecisionZoom(PRECISION_ZOOM, -1), 1.3);
  assert.equal(adjustPrecisionZoom(1.5, 2), 1.7);
  assert.equal(adjustPrecisionZoom(1.5, -3), MIN_PRECISION_ZOOM);
  assert.equal(adjustPrecisionZoom(2.0, 50), MAX_PRECISION_ZOOM);
  assert.equal(adjustPrecisionZoom(MAX_PRECISION_ZOOM, -1), 2.1);
  assert.equal(adjustPrecisionZoom(1.4, 0.9), 1.4,
    'fractional scroll noise cannot create unstable scale');
  assert.equal(adjustPrecisionZoom(NaN, 1), PRECISION_ZOOM);
  assert.equal(adjustPrecisionZoom(1.4, Infinity), PRECISION_ZOOM);
  assert.equal(PRECISION_ZOOM, 1.4, 'initial opt-in view remains 1.4x');
});

test('wheel zoom keeps a chosen cloth spot at the same screen coordinate', () => {
  const focus = Object.freeze({ x: -0.175, z: 0.0 });
  const worldPoint = Object.freeze({ x: 2.05, z: 0.5 });
  const next = zoomPrecisionFocusAtPoint(focus, worldPoint, 1.4, 1.6, 4.35, 2.15);
  const project = (value, anchor, zoom) => (value - anchor) * zoom;
  for (const axis of ['x', 'z']) {
    assert.ok(Math.abs(project(worldPoint[axis], focus[axis], 1.4) -
      project(worldPoint[axis], next[axis], 1.6)) < 1e-10,
      'target stays under the same pixel in ' + axis);
  }
  const restored = zoomPrecisionFocusAtPoint(next, worldPoint, 1.6, 1.4, 4.35, 2.15);
  assert.ok(Math.abs(restored.x - focus.x) < 1e-10);
  assert.ok(Math.abs(restored.z - focus.z) < 1e-10);
  assert.deepEqual(focus, { x: -0.175, z: 0 }, 'do not change prior camera state');
  assert.deepEqual(worldPoint, { x: 2.05, z: 0.5 }, 'do not change physical target');
  assert.equal(zoomPrecisionFocusAtPoint(focus, null, 1.4, 1.6, 4.35, 2.15), focus);
  assert.equal(zoomPrecisionFocusAtPoint(focus, worldPoint, 1.4, 1.4, 4.35, 2.15), focus);
  assert.deepEqual(zoomPrecisionFocusAtPoint(focus, { x: 99, z: 99 }, 1.2, 2.2, 4.35, 2.15),
    { x: 4.35, z: 2.15 }, 'clamping keeps tabletop discoverable');
});

test('precision camera panning is bounded and leaves game coordinates untouched', () => {
  const start = Object.freeze({ x: -0.175, z: 0 });
  assert.deepEqual(panPrecisionFocus(start, -0.65, -0.42, 4.35, 2.15),
    { x: -0.825, z: -0.42 });
  assert.deepEqual(start, { x: -0.175, z: 0 },
    'panning must not mutate the stored anchor or the ball positions');
  assert.deepEqual(panPrecisionFocus(start, -100, 100, 4.35, 2.15),
    { x: -4.35, z: 2.15 });
  assert.deepEqual(panPrecisionFocus({ x: 4.35, z: -2.15 }, 1, -1, 4.35, 2.15),
    { x: 4.35, z: -2.15 });
});

test('precision shot tracking eases toward live cue and first-contact target only', () => {
  const initial = Object.freeze({ x: -0.175, z: 0 });
  const cue = Object.freeze({ x: -1.4, z: 0.6 });
  const target = Object.freeze({ x: 2.05, z: 0 });
  assert.deepEqual(followPrecisionFocus(initial, cue, target, 0, 4.35, 2.15), initial);
  const next = followPrecisionFocus(initial, cue, target, 1 / 60, 4.35, 2.15);
  assert.ok(next.x > initial.x && next.x < (cue.x + target.x) / 2);
  assert.ok(next.z > 0 && next.z < cue.z / 2);
  assert.deepEqual(initial, { x: -0.175, z: 0 }, 'no mutation of camera anchor');
  assert.deepEqual(cue, { x: -1.4, z: 0.6 }, 'no mutation of physics ball');
  const stopped = followPrecisionFocus(next, { ...cue, pocketed: true }, target, 1 / 60, 4.35, 2.15);
  assert.equal(stopped, next, 'scratch cannot follow a pocketed cue');
  const pottedTarget = followPrecisionFocus(initial, cue, { ...target, pocketed: true }, 0.2, 4.35, 2.15);
  assert.ok(pottedTarget.x < initial.x, 'when target is pocketed the camera follows the white');
  const clamped = followPrecisionFocus({ x: 4.3, z: 2.1 }, { x: 50, z: 50 }, null, 1, 4.35, 2.15);
  assert.ok(clamped.x <= 4.35 && clamped.z <= 2.15);
});

test('the cue has a visible unique marker, unchanged physics size and muted stripe white', () => {
  assert.equal(poolBallSpec(0).cue, true);
  assert.equal(poolBallSpec(9).cue, false);
  assert.equal(BALL_COLORS[0], '#fff9e7');
  assert.equal(STRIPE_IVORY, '#dce1da');
  assert.ok(CUE_BALL_MARKER.spotRadiusScale >= 0.32,
    'cue spot must remain legible on the small mobile pool ball');
  assert.ok(CUE_BALL_MARKER.ringRadiusScale > 1.3 &&
    CUE_BALL_MARKER.ringRadiusScale < 1.65,
    'ring is clearly outside cue ball but must not become a giant arcade reticle');
  assert.ok(CUE_BALL_MARKER.tickDistanceScale > CUE_BALL_MARKER.ringRadiusScale,
    'cue locator ticks remain outside the ball and its rim');
  assert.ok(CUE_BALL_MARKER.tickLengthScale >= 0.4 &&
    CUE_BALL_MARKER.tickLengthScale <= 0.55,
    'locator strokes are clearly visible without obscuring the cloth');
  assert.notEqual(CUE_BALL_MARKER.spotColor, CUE_BALL_MARKER.ringColor);
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
    fillRect: (...args) => actions.push(['rect', ctx.fillStyle, ...args]),
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
  const skins = mockGraphics();
  createBallTexture(skins.THREE, 0, skins.documentRef);
  assert.ok(skins.actions.some((a) => a[0] === 'rect' && a[1] === BALL_COLORS[0]),
    'cue ivory must be painted, not simulated by lighting alone');
  const stripes = mockGraphics();
  createBallTexture(stripes.THREE, 9, stripes.documentRef);
  assert.ok(stripes.actions.some((a) => a[0] === 'rect' && a[1] === STRIPE_IVORY),
    'striped balls must no longer compete with the cue for the same white');
});
