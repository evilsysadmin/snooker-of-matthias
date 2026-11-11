// Restrained, locally synthesized pool sounds from actual measured physics.
// No audio assets, downloads, remote services or sound before a user gesture.
export const SOUND_PREFERENCE_KEY = 'shadowops.billiards.effects.v1';
const COOLDOWNS = Object.freeze({ contact: 65, rail: 110, potted: 120, scratch: 120 });
const MIN_IMPACT = Object.freeze({ contact: 0.22, rail: 0.32 });
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function readSoundEnabled(storage = () => window.localStorage) {
  try { return storage()?.getItem(SOUND_PREFERENCE_KEY) !== 'off'; }
  catch { return true; }
}
export function saveSoundEnabled(enabled, storage = () => window.localStorage) {
  try {
    storage()?.setItem(SOUND_PREFERENCE_KEY, enabled ? 'on' : 'off');
    return true;
  } catch { return false; }
}

// At most one pocket and one strong physical collision/rail per frame,
// with per-class cooldowns so a tight break never sounds like machine-gun fire.
// Uses only measured event data; has no access to mutable ball positions.
export function createFeedbackGate() {
  const last = { contact: -Infinity, rail: -Infinity, potted: -Infinity, scratch: -Infinity };
  function consume(events, nowMs) {
    if (!Array.isArray(events) || !Number.isFinite(nowMs)) return [];
    let pocket = null, contact = null, rail = null;
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      if (event.type === 'scratch' || event.type === 'potted') {
        if (event.type === 'scratch' || pocket === null) pocket = event.type;
      } else if ((event.type === 'contact' || event.type === 'rail') &&
          Number.isFinite(event.impactSpeed) &&
          event.impactSpeed >= MIN_IMPACT[event.type]) {
        const candidate = { type: event.type, speed: event.impactSpeed };
        if (event.type === 'contact' && (!contact || candidate.speed > contact.speed))
          contact = candidate;
        if (event.type === 'rail' && (!rail || candidate.speed > rail.speed))
          rail = candidate;
      }
    }
    const result = [];
    if (pocket && nowMs - last[pocket] >= COOLDOWNS[pocket]) {
      last[pocket] = nowMs;
      result.push({ type: pocket, strength: 0.72 });
    }
    const impact = !contact ? rail : !rail ? contact :
      (contact.speed >= rail.speed ? contact : rail);
    if (impact && nowMs - last[impact.type] >= COOLDOWNS[impact.type]) {
      last[impact.type] = nowMs;
      result.push({ type: impact.type, strength: clamp(impact.speed / 7, 0.18, 1) });
    }
    return result;
  }
  function reset() {
    for (const kind of Object.keys(last)) last[kind] = -Infinity;
  }
  return { consume, reset };
}

const VOICES = Object.freeze({
  strike: { start: 175, end: 112, duration: 0.095, level: 0.034, cutoff: 900 },
  contact: { start: 680, end: 350, duration: 0.055, level: 0.030, cutoff: 2600 },
  rail: { start: 270, end: 140, duration: 0.079, level: 0.026, cutoff: 1000 },
  potted: { start: 205, end: 93, duration: 0.12, level: 0.039, cutoff: 630 },
  scratch: { start: 128, end: 72, duration: 0.13, level: 0.036, cutoff: 500 },
});

function createNoise(ctx) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.14), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x82f547ab;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = (state / 2147483648 - 1) * (1 - i / data.length);
  }
  return buffer;
}

export function createBilliardsAudio({
  contextFactory = () => {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    return typeof Ctor === 'function' ? new Ctor() : null;
  },
  initialEnabled = readSoundEnabled(),
  persist = saveSoundEnabled,
} = {}) {
  let enabled = Boolean(initialEnabled);
  let context = null, noiseBuffer = null;
  function unlock() {
    if (!enabled) return false;
    try {
      if (!context) {
        context = contextFactory();
        if (!context) return false;
        noiseBuffer = createNoise(context);
      }
      if (context.state === 'suspended' && typeof context.resume === 'function')
        Promise.resolve(context.resume()).catch(() => {});
      return context.state !== 'closed';
    } catch {
      context = null;
      noiseBuffer = null;
      return false;
    }
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    try { persist(enabled); } catch { /* preferences must not break shots */ }
    if (enabled) unlock(); // Only called from the user's sound button.
    return enabled;
  }
  function play(kind, strength = 0.5) {
    const voice = VOICES[kind];
    if (!enabled || !context || context.state === 'closed' || !voice) return;
    try {
      const t = context.currentTime;
      const scaled = clamp(Number.isFinite(strength) ? strength : 0.5, 0.1, 1);
      const level = voice.level * (0.3 + scaled * 0.7);
      const end = t + voice.duration;
      const osc = context.createOscillator();
      const toneGain = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(voice.start * (0.9 + 0.18 * scaled), t);
      osc.frequency.exponentialRampToValueAtTime(voice.end, end);
      toneGain.gain.setValueAtTime(0.0001, t);
      toneGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + 0.004);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(toneGain);
      toneGain.connect(context.destination);
      osc.start(t);
      osc.stop(end + 0.008);

      // Short filtered cloth/ceramic attack rather than a long synthetic beep.
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = voice.cutoff;
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.0001, t);
      noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * 0.7), t + 0.002);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + voice.duration * 0.65);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(context.destination);
      noise.start(t);
      noise.stop(t + voice.duration * 0.67);
    } catch {
      // Audio is optional; unsupported or restricted browsers remain playable.
    }
  }
  return { unlock, play, setEnabled, isEnabled: () => enabled };
}
