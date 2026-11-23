// Presentation-only controls. Gameplay owns sound state and cue-ball impulse.
const spinChoices = [
  { value: 0, name: 'centro' },
  { value: 1, name: 'seguimiento' },
  { value: -1, name: 'retroceso' },
];

// Same cycle as the original UI: centre -> follow -> draw -> centre.
export function nextCueSpin(current) {
  const index = spinChoices.findIndex((choice) => choice.value === current);
  return spinChoices[(index + 1) % spinChoices.length].value;
}

export function renderCueSpinButton(button, spin) {
  const choice = spinChoices.find((item) => item.value === spin);
  button.querySelector('.spin-name').textContent =
    choice.value === 0 ? 'Centro' : choice.value > 0 ? 'Sigue' : 'Retro';
  button.dataset.spin = String(choice.value);
  button.setAttribute('aria-label', 'Efecto de la blanca: ' + choice.name + '. Pulsa para cambiar');
  button.title = 'Efecto de la blanca: ' + choice.name + ' · pulsa para cambiar';
}

export function renderSoundButton(button, enabled) {
  button.dataset.enabled = String(enabled);
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label',
    enabled ? 'Silenciar efectos de sonido' : 'Activar efectos de sonido');
  button.title = enabled ? 'Efectos sonoros activados' : 'Efectos sonoros desactivados';
  button.textContent = enabled ? '🔊' : '🔇';
}
