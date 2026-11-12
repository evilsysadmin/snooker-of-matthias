// Canonical premium pool table finishing. All textures are procedural:
// no network, asset downloads, new renderer dependency or physics coupling.
export const BALL_COLORS = Object.freeze([
  '#fff9e7', '#e9bc24', '#2259a7', '#b51f32', '#63358d',
  '#e7801f', '#19724d', '#7b3526', '#131a20',
  '#e9bc24', '#2259a7', '#b51f32', '#63358d',
  '#e7801f', '#19724d', '#7b3526',
]);
// Stronger *readability*, not a larger physical cue ball: real top-pole
// marker and a fine felt-level cue-selection ring that disappears in motion.
// Maximise the entire six-pocket tabletop, not the physical size of the balls.
// Old 0.89 hid a wide unused band around the table, especially on short
// laptops. Keep a 3.5% safety margin on the limiting axis so rails/pockets
// and cue-ball selection visuals remain completely in frame.
export const TOP_CAMERA_FILL = 0.965;
// Optical-only precision aid: ball physics and pocket sizes are unchanged.
export const PRECISION_ZOOM = 1.4;
// Keep both the white and the predicted first-contact ball on screen.
export function precisionFocus(cue, target) {
  if (!cue || !Number.isFinite(cue.x) || !Number.isFinite(cue.z)) return { x: 0, z: 0 };
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
    return { x: cue.x, z: cue.z };
  }
  return { x: (cue.x + target.x) / 2, z: (cue.z + target.z) / 2 };
}
export const CUE_BALL_MARKER = Object.freeze({
  spotColor: 0x1a4555, ringColor: 0xfbe0a2, rimColor: 0x0c3028,
  spotRadiusScale: 0.34, ringRadiusScale: 1.48,
  // Two small bracketing ticks make the cue locator legible in a portrait
  // viewport where the physical sphere can render only 8-10 px across.
  tickDistanceScale: 1.95, tickLengthScale: 0.48,
});
export const STRIPE_IVORY = '#dce1da';
export const LONG_RAIL_SIGHTS = Object.freeze([-3.56, -2.52, -1.44, 1.44, 2.52, 3.56]);
export const SHORT_RAIL_SIGHTS = Object.freeze([-1.02, 0, 1.02]);

export function poolBallSpec(number) {
  if (!Number.isInteger(number) || number < 0 || number >= BALL_COLORS.length)
    throw new RangeError('Pool balls must be numbered 0 through 15');
  return {
    number, color: BALL_COLORS[number],
    striped: number >= 9, cue: number === 0, black: number === 8,
  };
}

function canvas(size, documentRef) {
  const value = documentRef.createElement('canvas');
  value.width = size;
  value.height = size;
  return [value, value.getContext('2d')];
}

function texture(THREE, canvasElement) {
  const value = new THREE.CanvasTexture(canvasElement);
  value.colorSpace = THREE.SRGBColorSpace;
  value.anisotropy = 8;
  return value;
}

// Soft woven cloth nap. Deterministic noise eliminates giant flat green planes
// while never presenting false geometry or changing ball speed/drag.
export function createFeltTexture(THREE, documentRef = document) {
  const [surface, ctx] = canvas(256, documentRef);
  const image = ctx.createImageData(256, 256);
  let seed = 0x7e2dfe9a;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const grain = (seed >>> 24) % 13 - 6;
      const nap = (x + y) % 3;
      const i = (y * 256 + x) * 4;
      image.data[i] = 12 + grain;
      image.data[i + 1] = 77 + grain + nap;
      image.data[i + 2] = 53 + grain;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const result = texture(THREE, surface);
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(7, 4);
  return result;
}

// Subtle longitudinal grain reads as walnut rather than painted plastic.
export function createWalnutTexture(THREE, documentRef = document) {
  const [surface, ctx] = canvas(512, documentRef);
  ctx.fillStyle = '#47281d';
  ctx.fillRect(0, 0, 512, 512);
  let seed = 0x581d326;
  for (let i = 0; i < 760; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const y = seed % 512;
    const width = 1 + (seed % 3);
    const alpha = 0.025 + ((seed >>> 12) % 11) / 300;
    ctx.fillStyle = seed % 2 ? 'rgba(20,8,5,' + alpha + ')' :
      'rgba(246,182,104,' + alpha + ')';
    ctx.fillRect(0, y, 512, width);
  }
  const result = texture(THREE, surface);
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(2, 1);
  return result;
}

// Each sphere receives full-curvature UV color. Stripes are painted directly
// into the sphere map (rather than an overlaid, visibly floating shell).
export function createBallTexture(THREE, number, documentRef = document) {
  const spec = poolBallSpec(number);
  const [surface, ctx] = canvas(512, documentRef);
  ctx.fillStyle = spec.striped ? STRIPE_IVORY : spec.color;
  ctx.fillRect(0, 0, 512, 512);
  if (spec.striped) {
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 158, 512, 196);
    // Minimal dark edging like an actual enamel colour band.
    ctx.fillStyle = 'rgba(0,0,0,0.11)';
    ctx.fillRect(0, 158, 512, 4);
    ctx.fillRect(0, 350, 512, 4);
  }
  const sheen = ctx.createLinearGradient(0, 0, 0, 512);
  sheen.addColorStop(0, 'rgba(255,255,255,0.055)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.04)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 512, 512);
  return texture(THREE, surface);
}

export function createNumberTexture(THREE, number, documentRef = document) {
  const spec = poolBallSpec(number);
  if (spec.cue) return null;
  const [surface, ctx] = canvas(256, documentRef);
  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 125, 0, Math.PI * 2);
  ctx.fillStyle = '#faf8f0';
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#dad7cf';
  ctx.stroke();
  ctx.fillStyle = spec.black ? '#131819' : '#192229';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 ' + (number >= 10 ? 137 : 157) + 'px Arial, sans-serif';
  ctx.fillText(String(number), 128, 138);
  return texture(THREE, surface);
}
