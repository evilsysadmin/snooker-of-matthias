import * as THREE from 'three';
import {
  TABLE, POCKETS, OBJECT_BALL_COUNT, createRack, strikeCue, stepPhysics, ballsMoving, respawnCue,
} from './physics.js';
import './styles.css';
import { createShotCharge } from './shotCharge.js';

const app = document.querySelector('#app');
app.innerHTML = [
  '<main class="game">',
  '<div id="viewport" aria-label="Mesa de billar tridimensional interactiva"></div>',
  '<header class="topbar">',
    '<div class="brand"><span class="brand-icon">✦</span><div class="brand-copy">',
      '<small>SHADOWOPS PRESENTA</small><strong>SNOOKER <em>OF</em> MATTHIAS</strong>',
    '</div></div>',
    '<div class="scoreboard" aria-live="polite">',
      '<div><span>TIROS</span><strong id="shots">00</strong></div>',
      '<div class="score-divider"></div>',
      '<div><span>EMBOCADAS</span><strong id="potted">00 <small>/ ' + OBJECT_BALL_COUNT + '</small></strong></div>',
    '</div>',
  '</header>',
  '<div class="table-label"><span class="table-label-dot"></span> SNOOKER · PRÁCTICA LIBRE · 3D ALPHA</div>',
  '<section class="bottom-panel" aria-label="Controles de billar">',
    '<div class="commentary"><div class="monogram">M</div><div>',
    '<small>MATTHIAS · CRÍTICO DE PRECISIÓN</small>',
    '<p id="commentary" role="status">Guten Abend. Apunta sobre la mesa, elige potencia y golpea. Procura no humillarte.</p>',
    '</div></div>',
    '<div class="shot-controls">',
      '<div class="power"><div class="power-heading"><span>POTENCIA</span><output id="power-value" for="power">55%</output></div>',
      '<input id="power" type="range" min="0" max="100" value="55" aria-label="Potencia del golpe" /></div>',
      '<button id="strike" class="strike" type="button"><span>⚡</span> GOLPEAR <kbd>ESPACIO</kbd></button>',
      '<button id="restart" class="restart" type="button" title="Recolocar las bolas" aria-label="Reiniciar partida">↺</button>',
    '</div>',
    '<p class="hint">Apunta con ratón o dedo. Mantén ESPACIO para cargar: sube y baja; suelta para golpear. R reinicia.</p>',
  '</section>',
  '<div class="vignette" aria-hidden="true"></div>',
  '</main>',
].join('');

const viewport = document.querySelector('#viewport');
const shotDisplay = document.querySelector('#shots');
const pocketDisplay = document.querySelector('#potted');
const commentary = document.querySelector('#commentary');
const strikeButton = document.querySelector('#strike');
const restartButton = document.querySelector('#restart');
const powerInput = document.querySelector('#power');
const powerValue = document.querySelector('#power-value');
const charge = createShotCharge();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#071316');
scene.fog = new THREE.FogExp2('#071316', 0.026);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.30;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xd4fce7, 0x21120a, 2.1);
scene.add(hemi);
const key = new THREE.SpotLight(0xffe6bd, 150, 27, Math.PI / 3.3, 0.75, 1.35);
key.position.set(-1, 10, 2.3);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0002;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0x8ddfd8, 2.2);
fill.position.set(5, 6, -5);
scene.add(fill);

const wood = new THREE.MeshStandardMaterial({ color: 0x442a20, roughness: 0.48, metalness: 0.04 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x251b17, roughness: 0.44 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb59b5c, roughness: 0.28, metalness: 0.75 });
const felt = new THREE.MeshStandardMaterial({ color: 0x126b54, roughness: 0.98 });
const cushion = new THREE.MeshStandardMaterial({ color: 0x165943, roughness: 0.95 });
const pocketMaterial = new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 0.8, side: THREE.DoubleSide });

function box(w, h, d, x, y, z, mat, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x0b1718, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.30;
ground.receiveShadow = true;
scene.add(ground);

// The playing area is a real 3D surface with separate wood, cushion and pocket geometry.
box(9.35, 0.50, 4.94, 0, -0.36, 0, darkWood);
box(9.25, 0.22, 4.84, 0, -0.07, 0, wood);
box(8.92, 0.06, 4.48, 0, -0.005, 0, brass);
box(8.70, 0.04, 4.30, 0, 0.032, 0, felt);
for (const side of [-1, 1]) {
  // Split the long rails to expose the middle pockets.
  for (const half of [-1, 1]) {
    box(4.11, 0.18, 0.22, half * 2.30, 0.135, side * 2.30, wood);
    box(3.87, 0.075, 0.11, half * 2.29, 0.095, side * 2.16, cushion);
    box(3.83, 0.016, 0.022, half * 2.29, 0.236, side * 2.38, brass);
  }
  box(0.25, 0.18, 3.74, side * 4.51, 0.135, 0, wood);
  box(0.10, 0.075, 3.63, side * 4.37, 0.095, 0, cushion);
  box(0.025, 0.016, 3.66, side * 4.65, 0.236, 0, brass);
}
for (const [x, z] of POCKETS) {
  const hole = new THREE.Mesh(new THREE.CircleGeometry(TABLE.pocketRadius, 48), pocketMaterial);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, 0.06, z);
  scene.add(hole);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(TABLE.pocketRadius + 0.016, 0.018, 10, 48),
    brass,
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(x, 0.065, z);
  scene.add(rim);
}
// Leather pockets and warm brass leg details give scale even at a distance.
for (const x of [-3.72, 3.72]) for (const z of [-1.64, 1.64]) {
  box(0.37, 0.93, 0.37, x, -0.99, z, wood);
  box(0.39, 0.06, 0.39, x, -1.10, z, brass);
}

const ballGeo = new THREE.SphereGeometry(TABLE.ballRadius, 32, 24);
// White, 15 reds, then yellow, green, brown, blue, pink and black.
const colors = [
  0xfaf9ed, ...Array(15).fill(0xb11e2e),
  0xf1d02d, 0x237342, 0x86502d, 0x244cb2, 0xf0a0b2, 0x15191b,
];
function ballModel(number) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(ballGeo, new THREE.MeshPhysicalMaterial({
    color: colors[number], roughness: 0.15, clearcoat: 0.85, clearcoatRoughness: 0.12,
  }));
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  scene.add(group);
  return group;
}

const models = new Map();
for (let number = 0; number <= OBJECT_BALL_COUNT; number++) models.set(number, ballModel(number));

const aim = new THREE.Vector3(1, 0, 0);
const cueMaterial = new THREE.MeshStandardMaterial({ color: 0xd7a465, roughness: 0.42 });
const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x43241d, roughness: 0.36 });
const tipMaterial = new THREE.MeshStandardMaterial({ color: 0x7ebfc0, roughness: 0.6 });
const cueStick = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.057, 2.65, 14), cueMaterial);
shaft.rotation.z = Math.PI / 2;
cueStick.add(shaft);
const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.059, 0.061, 0.77, 14), gripMaterial);
grip.rotation.z = Math.PI / 2;
grip.position.x = -1.05;
cueStick.add(grip);
const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.06, 12), tipMaterial);
tip.rotation.z = Math.PI / 2;
tip.position.x = 1.34;
cueStick.add(tip);
scene.add(cueStick);
const guide = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2, 0.1, 0), new THREE.Vector3(2, 0.1, 0),
  ]),
  new THREE.LineDashedMaterial({ color: 0xd4f6d9, dashSize: 0.13, gapSize: 0.12, transparent: true, opacity: 0.6 }),
);
scene.add(guide);
const cueDirection = new THREE.Vector3(1, 0, 0);

let balls = createRack();
let shots = 0;
let potted = 0;
let dragging = false;
let wasMoving = false;
let scratchPending = false;
let dirtyHUD = true;

function say(message) { commentary.textContent = message; }
function formatScore() {
  shotDisplay.textContent = String(shots).padStart(2, '0');
  pocketDisplay.innerHTML = String(potted).padStart(2, '0') + ' <small>/ ' + OBJECT_BALL_COUNT + '</small>';
}
function restart() {
  charge.cancel();
  powerInput.classList.remove('charging');
  balls = createRack();
  shots = 0;
  potted = 0;
  scratchPending = false;
  wasMoving = false;
  dirtyHUD = true;
  say('Matthias: Otra oportunidad de desafiar a la geometría. Adelante, campeón.');
}
function shoot(power = Number(powerInput.value) / 100) {
  if (strikeCue(balls, aim.x, aim.z, power)) {
    shots++;
    dirtyHUD = true;
    say(['Matthias: Veamos si la física está de tu parte.',
      'Matthias: La precisión es una virtud. En tu caso, una aspiración.',
      'Matthias: Interesante. Un experimento con consecuencias.',
      'Matthias: Jawohl. Que las bandas decidan tu destino.'][shots % 4]);
  }
}
strikeButton.addEventListener('click', () => shoot());
restartButton.addEventListener('click', restart);
function paintPower(value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  powerInput.value = String(percent);
  powerValue.textContent = percent + '%';
  powerInput.style.setProperty('--progress', percent + '%');
}
powerInput.addEventListener('input', () => paintPower(Number(powerInput.value)));
paintPower(Number(powerInput.value));

function cancelCharge() {
  charge.cancel();
  powerInput.classList.remove('charging');
}
window.addEventListener('keydown', (event) => {
  if (event.target === powerInput || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat && !ballsMoving(balls) && !balls[0].pocketed) {
      if (charge.start(performance.now())) powerInput.classList.add('charging');
    }
    return;
  }
  if (!event.repeat && event.key.toLowerCase() === 'r') restart();
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space' || !charge.active) return;
  event.preventDefault();
  const power = charge.release(performance.now());
  powerInput.classList.remove('charging');
  paintPower(power * 100);
  if (power > 0) shoot(power);
});
window.addEventListener('blur', cancelCharge);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelCharge();
});

const ray = new THREE.Raycaster();
const clothPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.ballRadius);
const pointer = new THREE.Vector2();
const point = new THREE.Vector3();
function pointAim(event) {
  if (ballsMoving(balls) || balls[0].pocketed) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1);
  ray.setFromCamera(pointer, camera);
  if (!ray.ray.intersectPlane(clothPlane, point)) return;
  const dx = point.x - balls[0].x;
  const dz = point.z - balls[0].z;
  if (Math.hypot(dx, dz) < TABLE.ballRadius * 2) return;
  aim.set(dx, 0, dz).normalize();
}
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  pointAim(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' || dragging) pointAim(event);
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

function updateCue() {
  const cue = balls[0];
  const available = !cue.pocketed && !ballsMoving(balls);
  cueStick.visible = available;
  guide.visible = available;
  if (!available) return;
  const offset = 1.86 + (Number(powerInput.value) / 100) * 0.20;
  cueStick.position.set(cue.x - aim.x * offset, 0.30, cue.z - aim.z * offset);
  cueDirection.copy(aim);
  cueStick.rotation.y = -Math.atan2(aim.z, aim.x);
  const front = new THREE.Vector3(cue.x + aim.x * 0.20, 0.095, cue.z + aim.z * 0.20);
  const end = new THREE.Vector3(cue.x + aim.x * 5.0, 0.095, cue.z + aim.z * 5.0);
  guide.geometry.setFromPoints([front, end]);
  guide.computeLineDistances();
}

// Fit the *actual projected tabletop*, not an arbitrary camera distance. The
// viewport excludes the header and controls, so no useful space is wasted.
const tableCorners = [];
for (const x of [-4.75, 4.75]) {
  for (const y of [-0.12, 0.28]) {
    for (const z of [-2.51, 2.51]) tableCorners.push(new THREE.Vector3(x, y, z));
  }
}
const projectedCorner = new THREE.Vector3();
function resize() {
  const rect = viewport.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  const portrait = width <= 700 && height > width * 1.15;
  camera.up.set(portrait ? 1 : 0, portrait ? 0 : 1, 0);
  camera.updateProjectionMatrix();
  const target = new THREE.Vector3(0, -0.04, 0);
  const direction = portrait
    ? new THREE.Vector3(0, 0.87, 0.50).normalize()
    : new THREE.Vector3(-0.06, 0.77, 0.72).normalize();
  function fits(distance) {
    camera.position.copy(direction).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return tableCorners.every((corner) => {
      projectedCorner.copy(corner).project(camera);
      return Math.abs(projectedCorner.x) < 0.91 && Math.abs(projectedCorner.y) < 0.88;
    });
  }
  let near = 4, far = 60;
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  fits(far);
}
new ResizeObserver(resize).observe(viewport);
resize();

let lastFrame = performance.now();
let accumulator = 0;
const FIXED_DT = 1 / 120;
function frame(now) {
  if (charge.active) paintPower(charge.sample(now) * 100);
  const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  accumulator += elapsed;
  let n = 0;
  while (accumulator >= FIXED_DT && n++ < 7) {
    const events = stepPhysics(balls, FIXED_DT);
    for (const event of events) {
      if (event.type === 'scratch') {
        scratchPending = true;
        say('Matthias: Has metido la blanca. Wunderbar. No es precisamente el objetivo.');
      } else {
        potted++;
        dirtyHUD = true;
        say('Matthias: Una bola embocada. Debe de haber sido accidental.');
      }
    }
    accumulator -= FIXED_DT;
  }
  if (!ballsMoving(balls)) {
    if (scratchPending && respawnCue(balls)) scratchPending = false;
    if (wasMoving && !scratchPending && potted === OBJECT_BALL_COUNT) {
      say('Matthias: Todas dentro. Me veo obligado, muy a mi pesar, a felicitarte.');
    }
  }
  wasMoving = ballsMoving(balls);
  if (dirtyHUD) { formatScore(); dirtyHUD = false; }
  strikeButton.disabled = wasMoving || balls[0].pocketed;
  for (const b of balls) {
    const model = models.get(b.id);
    model.visible = !b.pocketed;
    model.position.set(b.x, TABLE.ballRadius + 0.07, b.z);
  }
  updateCue();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
