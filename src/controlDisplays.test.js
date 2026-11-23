import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCueSpin, renderCueSpinButton, renderSoundButton } from './controlDisplays.js';

function buttonDouble() {
  const attributes = new Map();
  const spinName = { textContent: null };
  const button = {
    dataset: {},
    textContent: null,
    title: '',
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    querySelector(name) {
      assert.equal(name, '.spin-name');
      return spinName;
    },
  };
  return { button, spinName };
}

test('cue spin cycles centre -> follow -> draw -> centre without changing physics values', () => {
  let spin = 0;
  for (const expected of [1, -1, 0, 1, -1, 0]) {
    spin = nextCueSpin(spin);
    assert.equal(spin, expected);
  }
});

test('cue spin presentation matches button text, dataset and accessible labels', () => {
  const { button, spinName } = buttonDouble();
  for (const { value, visible, name } of [
    { value: 0, visible: 'Centro', name: 'centro' },
    { value: 1, visible: 'Sigue', name: 'seguimiento' },
    { value: -1, visible: 'Retro', name: 'retroceso' },
  ]) {
    renderCueSpinButton(button, value);
    assert.equal(spinName.textContent, visible);
    assert.equal(button.dataset.spin, String(value));
    assert.equal(button.getAttribute('aria-label'), 'Efecto de la blanca: ' + name + '. Pulsa para cambiar');
    assert.equal(button.title, 'Efecto de la blanca: ' + name + ' · pulsa para cambiar');
  }
});

test('sound button keeps visual, tooltip and screen-reader state synchronized', () => {
  const { button } = buttonDouble();
  renderSoundButton(button, true);
  assert.equal(button.dataset.enabled, 'true');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Silenciar efectos de sonido');
  assert.equal(button.title, 'Efectos sonoros activados');
  assert.equal(button.textContent, '🔊');

  renderSoundButton(button, false);
  assert.equal(button.dataset.enabled, 'false');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Activar efectos de sonido');
  assert.equal(button.title, 'Efectos sonoros desactivados');
  assert.equal(button.textContent, '🔇');

  renderSoundButton(button, true);
  assert.equal(button.getAttribute('aria-pressed'), 'true', 're-enabling sound restores accessibility');
});
