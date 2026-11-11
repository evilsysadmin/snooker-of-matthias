import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCueStick } from './cueVisuals.js';
import { CUE_TIP_LOCAL_X, cueStrokePose, cueIdleGap } from './cueMotion.js';

test('real cue taper narrows toward the chalk tip, not the grip', () => {
  const cue = createCueStick(THREE);
  const shaft = cue.getObjectByName('cue-shaft');
  const grip = cue.getObjectByName('cue-grip');
  assert.ok(shaft && grip);
  assert.equal(cue.children.length, 7, 'bounded meshes, no new scene lights');
  assert.equal(shaft.rotation.z, Math.PI / 2);
  assert.ok(shaft.geometry.parameters.radiusTop > shaft.geometry.parameters.radiusBottom,
    'Three cylinder top rotates toward the butt (-X); bottom is the thin tip (+X)');
  assert.ok(shaft.geometry.parameters.radiusBottom < grip.geometry.parameters.radiusBottom);
  assert.equal(shaft.geometry.parameters.height, 2.65, 'same shaft reach and tip clearance');
  assert.equal(grip.position.x, -1.05);
  assert.equal(shaft.material.type, 'MeshPhysicalMaterial');
  assert.ok(shaft.material.clearcoat > 0 && shaft.material.clearcoat <= 1);
});

test('ferrule, chalk tip and rings stay attached to the animated local cue axis', () => {
  const cue = createCueStick(THREE);
  const ferrule = cue.getObjectByName('cue-ferrule');
  const tip = cue.getObjectByName('cue-tip');
  const butt = cue.getObjectByName('cue-butt-cap');
  assert.equal(tip.position.x, CUE_TIP_LOCAL_X);
  assert.ok(tip.position.x > ferrule.position.x);
  assert.ok(ferrule.position.x > 0);
  assert.ok(butt.position.x < -1.4);
  assert.ok(cue.getObjectByName('cue-wrap-ring').position.x <
    cue.getObjectByName('cue-shaft').position.x);
  for (const part of cue.children) {
    assert.equal(part.rotation.z, Math.PI / 2);
    assert.equal(part.position.y, 0);
    assert.equal(part.position.z, 0);
    assert.ok(part.geometry.parameters.height > 0);
  }
  // The existing visual shot timeline owns the position, not the meshes.
  assert.equal(cueStrokePose(0, .55).gap, cueIdleGap(.55));
  assert.equal(cueStrokePose(52, .55).gap, .033);
});

test('the cue model is offline/local and does not mutate shared physical ball geometry', () => {
  const first = createCueStick(THREE);
  const next = createCueStick(THREE);
  assert.notEqual(first, next);
  for (const cue of [first, next]) {
    assert.ok(cue.children.every(part => part.material && part.geometry));
    assert.ok(cue.children.every(part => part.material.isMaterial));
    assert.ok(cue.children.every(part => part.geometry.isBufferGeometry));
    assert.ok(cue.children.every(part => part.castShadow === (part.name === 'cue-shaft' || part.name === 'cue-grip')));
  }
});
