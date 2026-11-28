import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGameMarkup } from './gameMarkup.js';

test('initial game UI keeps uniquely addressable controls', () => {
  const markup = renderGameMarkup(15);
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 20, 'expected the real game control DOM');
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids would break querySelector');
  for (const id of [
    'viewport', 'target-lens', 'shots', 'potted', 'strike', 'restart',
    'power', 'spin-cycle', 'mode-practice', 'mode-solo', 'solo-status',
    'camera-top', 'camera-3d', 'precision-zoom', 'precision-zoom-compact',
    'fine-left', 'fine-right', 'update-banner', 'update-now', 'update-later',
  ]) {
    assert.ok(ids.includes(id), `missing required UI control #${id}`);
  }
});

test('ball count is rendered from the physics rules, not hardcoded', () => {
  assert.match(renderGameMarkup(15), /15 en mesa/);
  assert.match(renderGameMarkup(3), /3 en mesa/);
  assert.doesNotMatch(renderGameMarkup(3), /15 en mesa/);
});

test('initial markup reserves an accessible factual shot result', () => {
  const markup = renderGameMarkup(15);
  assert.match(markup, /id="shot-summary"/);
  assert.match(markup, /id="shot-summary"[^>]*role="status"/);
  assert.match(markup, /id="shot-summary"[^>]*hidden/);
});

test('initial markup contains accessible status and controls', () => {
  const markup = renderGameMarkup(15);
  assert.match(markup, /id="commentary" role="status"/);
  assert.match(markup, /id="power" type="range"/);
  assert.match(markup, /id="viewport" aria-label=/);
});
