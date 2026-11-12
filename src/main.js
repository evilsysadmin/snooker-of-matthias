import * as THREE from 'three';
import {
  TABLE, POCKETS, POCKET_JAWS, CUE_START, RACK_APEX, OBJECT_BALL_COUNT, createRack, strikeCue, stepPhysics, ballsMoving, respawnCue, canPlaceCueOnTable,
} from './physics.js';
import './styles.css';
import { createShotCharge } from './shotCharge.js';
import { cueIdleGap, cueStrokePose, CUE_TIP_LOCAL_X } from './cueMotion.js';
import { createCueStick } from './cueVisuals.js';
import { predictFirstContact } from './aimPrediction.js';
import { FINE_AIM_STEP_DEGREES, rotateAim } from './fineAim.js';
import { resolveStrokePower } from './strokeInteraction.js';
import { remainingObjectBalls } from './practiceRules.js';
import { canShowUpdateNotice, createVersionWatcher } from './versionNotice.js';
import { newSoloChallenge, settleSoloShot, readSoloBest, saveSoloBest } from './soloChallenge.js';
import { createFeedbackGate, createBilliardsAudio } from './shotFeedback.js';
import { poolBallSpec, LONG_RAIL_SIGHTS, SHORT_RAIL_SIGHTS,
  createFeltTexture, createWalnutTexture, createBallTexture, createNumberTexture,
  CUE_BALL_MARKER, TOP_CAMERA_FILL, PRECISION_ZOOM, precisionFocus, panPrecisionFocus } from './poolVisuals.js';

const app = document.querySelector('#app');
app.innerHTML = [
  '<main class="game">',
  '<div id="viewport" aria-label="Mesa de billar tridimensional interactiva">',
    '<div id="target-lens" class="target-lens" data-side="right" hidden',
      ' aria-label="Bola prevista en el primer contacto">',
      '<span class="target-ball" aria-hidden="true"><span id="target-ball-number"></span></span>',
      '<span class="target-lens-label" aria-hidden="true">PRIMER TOQUE</span>',
    '</div>',
  '</div>',
  '<header class="topbar">',
    '<div class="brand"><span class="brand-icon">✦</span><div class="brand-copy">',
      '<small>SHADOWOPS PRESENTA</small><strong>BILLIARDS <em>OF</em> MATTHIAS</strong>',
    '</div></div>',
    '<div class="mode-switch" role="group" aria-label="Modalidad y efectos sonoros">',
      '<button id="mode-practice" type="button" aria-pressed="true" title="Práctica libre; cambiar reinicia la mesa">Libre</button>',
      '<button id="mode-solo" type="button" aria-pressed="false" title="Desafío individual: emboca las 15 en el menor número de tiros">Desafío 15</button>',
      '<button id="sound-toggle" class="sound-toggle" type="button" aria-pressed="true" aria-label="Silenciar efectos de sonido" title="Efectos sonoros activados">🔊</button>',
    '</div>',
    '<div class="scoreboard" aria-live="polite">',
      '<div><span>TIROS</span><strong id="shots">00</strong></div>',
      '<div class="score-divider"></div>',
      '<div><span>EMBOCADAS</span><strong id="potted">00 <small>· ' + OBJECT_BALL_COUNT + ' en mesa</small></strong></div>',
    '</div>',
  '</header>',
  '<div class="table-label"><span class="table-label-dot"></span> POOL 8-BALL · PRÁCTICA LIBRE · 3D ALPHA</div>',
  '<div id="solo-status" class="solo-status" role="status" aria-live="polite" hidden></div>',
  '<aside id="update-banner" class="update-banner" role="status" hidden>',
    '<div class="update-copy"><strong>🎱 Nueva versión disponible</strong>',
      '<div>Actualizar reinicia la mesa actual.</div></div>',
    '<button id="update-now" class="update-now" type="button">Actualizar</button>',
    '<button id="update-later" class="update-later" type="button">Más tarde</button>',
  '</aside>',
  '<div class="camera-switch" role="group" aria-label="Vista de cámara">',
    '<button id="camera-top" class="camera-option" type="button" aria-pressed="true">Cenital</button>',
    '<button id="camera-3d" class="camera-option" type="button" aria-pressed="false">3D</button>',
    '<button id="precision-zoom" class="camera-option precision-zoom" type="button" aria-pressed="false"',
      ' aria-label="Acercar la mesa 1,4 veces en vista cenital" title="Ampliar puntería sin cambiar el tiro">Zoom ×1,4</button>',
  '</div>',
  '<section class="bottom-panel" aria-label="Controles de billar">',
    '<div class="commentary"><div class="monogram">M</div><div>',
    '<small>MATTHIAS · CRÍTICO DE PRECISIÓN</small>',
    '<p id="commentary" role="status">Guten Abend. Apunta sobre la mesa, elige potencia y golpea. Procura no humillarte.</p>',
    '</div></div>',
    '<div class="shot-controls">',
      '<div class="power"><div class="power-heading"><span>POTENCIA</span><output id="power-value" for="power">55%</output></div>',
      '<input id="power" type="range" min="0" max="100" value="55" aria-label="Potencia del golpe" /></div>',
      '<button id="spin-cycle" class="spin-cycle" type="button" data-spin="0" aria-label="Efecto de la blanca: centro. Pulsa para cambiar" title="Efecto de la blanca: centro · pulsa para cambiar">',
        '<span class="spin-title" aria-hidden="true">GIRO (EFECTO)</span>',
        '<span class="spin-disc" aria-hidden="true"><span class="spin-dot"></span></span>',
        '<span class="spin-name" aria-hidden="true">Centro</span>',
      '</button>',
      '<button id="strike" class="strike" type="button" aria-label="Golpear: toca para usar la potencia elegida, mantén pulsado para cargar" title="Toca para golpear · mantén pulsado para cargar"><span>⚡</span> GOLPEAR <kbd>ESPACIO</kbd></button>',
      '<button id="restart" class="restart" type="button" title="Recolocar las bolas" aria-label="Reiniciar partida">↺</button>',
    '</div>',
    '<p class="hint">Apunta sobre el paño · ← → ajustan la dirección · ESPACIO golpea · R reinicia.</p>',
    '<div class="fine-aim" role="group" aria-label="Ajuste fino de puntería">',
      '<button id="fine-left" class="fine-step" type="button" aria-label="Girar puntería 0,5 grados a la izquierda">↶ <span>0,5°</span></button>',
      '<div class="fine-status"><small>AJUSTE FINO</small><output id="fine-angle" aria-live="polite">0,0°</output></div>',
      '<button id="fine-right" class="fine-step" type="button" aria-label="Girar puntería 0,5 grados a la derecha"><span>0,5°</span> ↷</button>',
    '</div>',
  '</section>',
  '<div class="vignette" aria-hidden="true"></div>',
  '</main>',
].join('');

const viewport = document.querySelector('#viewport');
const targetLens = document.querySelector('#target-lens');
const targetBallNumber = document.querySelector('#target-ball-number');
let hasAimed = false;
let lastLensTarget = null;
let lensPositionDirty = true;
const shotDisplay = document.querySelector('#shots');
const pocketDisplay = document.querySelector('#potted');
const commentary = document.querySelector('#commentary');
const strikeButton = document.querySelector('#strike');
const restartButton = document.querySelector('#restart');
const spinButton = document.querySelector('#spin-cycle');
const powerInput = document.querySelector('#power');
const powerValue = document.querySelector('#power-value');
const topCameraButton = document.querySelector('#camera-top');
const perspectiveCameraButton = document.querySelector('#camera-3d');
const precisionZoomButton = document.querySelector('#precision-zoom');
const fineLeft = document.querySelector('#fine-left');
const fineRight = document.querySelector('#fine-right');
const fineAngle = document.querySelector('#fine-angle');
const charge = createShotCharge();
const modePractice = document.querySelector('#mode-practice');
const modeSolo = document.querySelector('#mode-solo');
const soloStatus = document.querySelector('#solo-status');
const soundToggle = document.querySelector('#sound-toggle');
const tableLabel = document.querySelector('.table-label');
const updateBanner = document.querySelector('#update-banner');
const updateNow = document.querySelector('#update-now');
const updateLater = document.querySelector('#update-later');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#071316');
const perspectiveFog = new THREE.FogExp2('#071316', 0.026);
const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const topCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
let camera = topCamera;
let precisionZoom = false;
let precisionAnchor = { x: 0, z: 0 };
scene.fog = null;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xe1f5ec, 0x25160f, 1.65);
scene.add(hemi);
const key = new THREE.SpotLight(0xffe6bf, 142, 27, Math.PI / 3.3, 0.73, 1.35);
key.position.set(-1, 10, 2.3);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0002;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0x9bddd5, 1.65);
fill.position.set(5, 6, -5);
scene.add(fill);

const wood = new THREE.MeshStandardMaterial({
  color: 0xffffff, map: createWalnutTexture(THREE),
  roughness: 0.32, metalness: 0.06,
});
const darkWood = new THREE.MeshStandardMaterial({ color: 0x221914, roughness: 0.47 });
const brass = new THREE.MeshStandardMaterial({
  color: 0xb79957, roughness: 0.31, metalness: 0.72,
});
const railInlay = new THREE.MeshStandardMaterial({
  color: 0xd5b46d, roughness: 0.41, metalness: 0.60,
});
const felt = new THREE.MeshStandardMaterial({
  color: 0xffffff, map: createFeltTexture(THREE), roughness: 0.99,
});
const cushion = new THREE.MeshStandardMaterial({ color: 0x145b43, roughness: 0.94 });
const pocketMaterial = new THREE.MeshStandardMaterial({
  color: 0x020708, roughness: 1, side: THREE.DoubleSide,
});
const pocketLeather = new THREE.MeshStandardMaterial({ color: 0x21160f, roughness: 0.83 });
const noseFelt = new THREE.MeshStandardMaterial({ color: 0x1b654b, roughness: 0.95 });

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
// Thin, restrained shadow line separates the walnut crown from brass trim.
box(9.29, 0.034, 4.86, 0, -0.168, 0, darkWood);
for (const side of [-1, 1]) {
  // Split the long rails to expose the middle pockets.
  for (const half of [-1, 1]) {
    box(4.11, 0.18, 0.22, half * 2.30, 0.135, side * 2.30, wood);
    box(3.87, 0.075, 0.11, half * 2.29, 0.095, side * 2.16, cushion);
    box(3.83, 0.016, 0.022, half * 2.29, 0.236, side * 2.38, railInlay);
    // Round the visible nose of each cushion; the underlying collision wall is unchanged.
    const longNose = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 3.87, 12), noseFelt);
    longNose.rotation.z = Math.PI / 2;
    longNose.position.set(half * 2.29, 0.135, side * 2.145);
    longNose.receiveShadow = true;
    scene.add(longNose);
  }
  box(0.25, 0.18, 3.74, side * 4.51, 0.135, 0, wood);
  box(0.10, 0.075, 3.63, side * 4.37, 0.095, 0, cushion);
  box(0.025, 0.016, 3.66, side * 4.65, 0.236, 0, railInlay);
  const shortNose = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 3.63, 12), noseFelt);
  shortNose.rotation.x = Math.PI / 2;
  shortNose.position.set(side * 4.35, 0.135, 0);
  shortNose.receiveShadow = true;
  scene.add(shortNose);
}
// Flush ivory/brass diamond sights across real wooden rails. Decorative
// only: none intersects the physical cloth, pockets or ball collision solver.
const railSight = new THREE.OctahedronGeometry(1, 0);
const sightMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0d7a2, roughness: 0.25, metalness: 0.35,
  emissive: 0x533714, emissiveIntensity: 0.08,
});
function addRailSight(x, z, angle = 0) {
  const marker = new THREE.Mesh(railSight, sightMaterial);
  marker.scale.set(0.045, 0.010, 0.029);
  marker.position.set(x, 0.238, z);
  marker.rotation.y = angle;
  scene.add(marker);
}
for (const x of LONG_RAIL_SIGHTS) {
  addRailSight(x, -2.37); addRailSight(x, 2.37);
}
for (const z of SHORT_RAIL_SIGHTS) {
  addRailSight(-4.54, z, Math.PI / 2);
  addRailSight(4.54, z, Math.PI / 2);
}

for (const [x, z, radius] of POCKETS) {
  const hole = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), pocketMaterial);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, 0.06, z);
  scene.add(hole);
  // A dark, softly rounded leather mouth reads as a recessed pocket.
  // Avoid the bright complete metal hoops of the original pool-style prototype.
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.005, 0.030, 10, 48),
    pocketLeather,
  );
  lip.rotation.x = -Math.PI / 2;
  lip.position.set(x, 0.066, z);
  scene.add(lip);
}

// A short, restrained pulse is attached to the *actual* pocket index emitted
// by the physics. No particles, permanent glows or extra overlay panels.
const reduceFeedbackMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const pocketPulses = POCKETS.map(([x, z, radius]) => {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf2d08c, transparent: true, opacity: 0,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.047, 0.014, 6, 40), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.18, z);
  ring.renderOrder = 6;
  ring.visible = false;
  scene.add(ring);
  return { ring, at: -Infinity };
});
function flashPocket(event, now) {
  if (!Number.isInteger(event.pocket) || !pocketPulses[event.pocket]) return;
  const pulse = pocketPulses[event.pocket];
  pulse.at = now;
  pulse.ring.material.color.set(event.type === 'scratch' ? 0xd69d85 : 0xf2d08c);
  pulse.ring.visible = true;
  pulse.ring.material.opacity = 0.55;
  pulse.ring.scale.setScalar(1);
}
function animatePocketPulses(now) {
  for (const { ring, at } of pocketPulses) {
    const age = now - at;
    const duration = reduceFeedbackMotion ? 150 : 330;
    if (age < 0 || age >= duration) {
      ring.visible = false;
      continue;
    }
    ring.visible = true;
    if (!reduceFeedbackMotion) {
      const progress = age / duration;
      ring.scale.setScalar(1 + 0.33 * progress);
      ring.material.opacity = 0.55 * (1 - progress);
    }
  }
}

// Soft felt-covered shoulders join the existing cushion noses rather than
// looking like detached green spheres. Their collision tips are the exact
// radii/centres exported by the deterministic physics model.
const jawGeometry = new THREE.SphereGeometry(TABLE.jawRadius, 20, 12);
const jawBridgeGeometry = new THREE.SphereGeometry(1, 16, 10);
for (const jaw of POCKET_JAWS) {
  const dx = jaw.railX - jaw.x, dz = jaw.railZ - jaw.z;
  const length = Math.hypot(dx, dz);
  const bridge = new THREE.Mesh(jawBridgeGeometry, noseFelt);
  bridge.position.set((jaw.x + jaw.railX) / 2, 0.135, (jaw.z + jaw.railZ) / 2);
  bridge.scale.set(length / 2 + 0.045, 0.023, 0.045);
  bridge.rotation.y = -Math.atan2(dz, dx);
  bridge.receiveShadow = true;
  scene.add(bridge);

  const tip = new THREE.Mesh(jawGeometry, noseFelt);
  tip.scale.y = 0.4; // Rounded cushion profile, not another snooker-sized ball.
  tip.position.set(jaw.x, 0.135, jaw.z);
  tip.castShadow = true;
  tip.receiveShadow = true;
  scene.add(tip);
}

// Pool head string and spots; no snooker D or colour respots.
const clothInk = new THREE.MeshBasicMaterial({
  color: 0xe8e6d1, transparent: true, opacity: 0.40, depthWrite: false,
});
const headString = new THREE.Mesh(
  new THREE.BoxGeometry(0.012, 0.003, 2 * TABLE.halfZ), clothInk,
);
headString.position.set(CUE_START.x, 0.056, 0);
scene.add(headString);
const spotGeometry = new THREE.CircleGeometry(0.020, 24);
const spotMaterial = new THREE.MeshBasicMaterial({
  color: 0xf2ead6, transparent: true, opacity: 0.65,
  depthWrite: false, side: THREE.DoubleSide,
});
for (const { x, z } of [CUE_START, RACK_APEX]) {
  const spot = new THREE.Mesh(spotGeometry, spotMaterial);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(x, 0.060, z);
  scene.add(spot);
}
// Leather pockets and warm brass leg details give scale even at a distance.
for (const x of [-3.72, 3.72]) for (const z of [-1.64, 1.64]) {
  box(0.37, 0.93, 0.37, x, -0.99, z, wood);
  box(0.39, 0.06, 0.39, x, -1.10, z, brass);
}
// Short gilded corner and side-pocket rail guards bring the approved table
// silhouette into the *real* renderer. They remain outside the ball path;
// pocket centres, jaws and the entire collision solver are unchanged.
const railGuard = new THREE.MeshStandardMaterial({
  color: 0xb88a45, roughness: 0.27, metalness: 0.82,
  emissive: 0x42260c, emissiveIntensity: 0.09,
});
for (const xSide of [-1, 1]) for (const zSide of [-1, 1]) {
  box(0.36, 0.042, 0.065, xSide * 4.21, 0.244, zSide * 2.32, railGuard);
  box(0.065, 0.042, 0.37, xSide * 4.52, 0.244, zSide * 1.99, railGuard);
}
for (const zSide of [-1, 1]) for (const xSide of [-1, 1]) {
  box(0.21, 0.042, 0.067, xSide * 0.40, 0.244, zSide * 2.32, railGuard);
}

// Full-curvature enamel colour and properly striped sphere maps.
// Slightly more tessellation and contact shadows make balls read as polished
// resin, not flat coloured dots. Never modify the physical ball radius.
const ballGeo = new THREE.SphereGeometry(TABLE.ballRadius, 32, 24);
const ballShadowGeo = new THREE.CircleGeometry(TABLE.ballRadius * 1.25, 32);
const ballShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x03120e, transparent: true, opacity: 0.18,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
});
const cueShadowMaterial = ballShadowMaterial.clone();
cueShadowMaterial.opacity = 0.34; // Ground the one pale cue ball on bright felt.
const cueSpotMaterial = new THREE.MeshBasicMaterial({
  color: CUE_BALL_MARKER.spotColor, depthWrite: false,
});
const cueRingBaseMaterial = new THREE.MeshBasicMaterial({
  color: CUE_BALL_MARKER.rimColor, depthWrite: false,
});
const cueRingMaterial = new THREE.MeshBasicMaterial({
  color: CUE_BALL_MARKER.ringColor, depthWrite: false,
});
function ballModel(number) {
  const spec = poolBallSpec(number);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(ballGeo, new THREE.MeshPhysicalMaterial({
    map: createBallTexture(THREE, number),
    color: 0xffffff,
    roughness: 0.16, metalness: 0, clearcoat: 1,
    clearcoatRoughness: 0.085, ior: 1.45,
  }));
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  if (spec.cue) {
    // A proper dark blue-green cue spot on the TOP of the ivory sphere.
    // Unlike a UI sprite, this is rendered by the real 3D camera.
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE.ballRadius * CUE_BALL_MARKER.spotRadiusScale, 24),
      cueSpotMaterial,
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = TABLE.ballRadius + 0.002;
    spot.renderOrder = 2;
    group.add(spot);

    // The double-line brass cue indicator is only about 1 ball-radius
    // wider than the ball. It sits above felt, below the ball silhouette.
    // Hide it while moving to avoid a misleading moving crosshair.
    const ring = new THREE.Group();
    for (const [tube, y, material] of [
      [0.020, 0.016, cueRingBaseMaterial],
      [0.011, 0.020, cueRingMaterial],
    ]) {
      const circle = new THREE.Mesh(
        new THREE.TorusGeometry(TABLE.ballRadius * CUE_BALL_MARKER.ringRadiusScale,
          tube, 6, 48),
        material,
      );
      circle.rotation.x = -Math.PI / 2;
      circle.position.y = -TABLE.ballRadius + y;
      ring.add(circle);
    }
    // Short, opposed locator ticks make the cue identifiable from a glance
    // in portrait/phone framing. Physically small, fixed to the ball position,
    // and hidden with the ring while balls are rolling.
    const tickWidth = TABLE.ballRadius * CUE_BALL_MARKER.tickLengthScale;
    for (const sign of [-1, 1]) {
      for (const [widthScale, material, y] of [
        [1.34, cueRingBaseMaterial, 0.018],
        [1, cueRingMaterial, 0.023],
      ]) {
        const tick = new THREE.Mesh(
          new THREE.BoxGeometry(tickWidth * widthScale, 0.004,
            TABLE.ballRadius * (widthScale === 1 ? 0.13 : 0.25)),
          material,
        );
        tick.position.set(sign * TABLE.ballRadius *
          CUE_BALL_MARKER.tickDistanceScale, -TABLE.ballRadius + y, 0);
        ring.add(tick);
      }
    }
    group.userData.cueRing = ring;
    group.add(ring);
  } else {
    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE.ballRadius * 0.44, 28),
      new THREE.MeshStandardMaterial({
        map: createNumberTexture(THREE, number),
        transparent: true, depthWrite: false,
        roughness: 0.2, side: THREE.DoubleSide,
      }),
    );
    badge.rotation.x = -Math.PI / 2;
    badge.position.y = TABLE.ballRadius * 1.004;
    group.add(badge);
  }
  const contact = new THREE.Mesh(ballShadowGeo,
    spec.cue ? cueShadowMaterial : ballShadowMaterial);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -TABLE.ballRadius + 0.005;
  contact.renderOrder = 0;
  group.add(contact);
  scene.add(group);
  return group;
}

const models = new Map();
for (let number = 0; number <= OBJECT_BALL_COUNT; number++) models.set(number, ballModel(number));

const aim = new THREE.Vector3(1, 0, 0);
// Self-contained 3D cue: maple taper, leather grip, ferrule and restrained trim.
// Its tip is still positioned by cueMotion; rendering never affects physics.
const cueStick = createCueStick(THREE);
scene.add(cueStick);
const guide = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2, 0.1, 0), new THREE.Vector3(2, 0.1, 0),
  ]),
  new THREE.LineDashedMaterial({ color: 0xd4f6d9, dashSize: 0.13, gapSize: 0.12, transparent: true, opacity: 0.6 }),
);
scene.add(guide);
// A translucent ghost-white ring marks the predicted cue-ball position at
// first contact; a small gold dot marks the actual surface contact on cut shots.
const ghostRing = new THREE.Mesh(
  new THREE.TorusGeometry(TABLE.ballRadius, 0.009, 7, 40),
  new THREE.MeshBasicMaterial({
    color: 0xeef8e8, transparent: true, opacity: 0.82, depthWrite: false, depthTest: false,
  }),
);
ghostRing.rotation.x = -Math.PI / 2;
ghostRing.renderOrder = 3;
ghostRing.visible = false;
scene.add(ghostRing);
const impactDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.023, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xf1c778, depthWrite: false, depthTest: false }),
);
impactDot.renderOrder = 4;
impactDot.visible = false;
scene.add(impactDot);
const placementGhost = new THREE.Mesh(
  new THREE.SphereGeometry(TABLE.ballRadius, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xf6e8be, transparent: true, opacity: 0.52,
    depthWrite: false, depthTest: false }),
);
placementGhost.renderOrder = 5;
placementGhost.visible = false;
scene.add(placementGhost);
const cueDirection = new THREE.Vector3(1, 0, 0);
const reducedCueMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let balls = createRack();
let shots = 0;
let potted = 0;
let dragging = false;
let panPointer = null;
let wasMoving = false;
let scratchPending = false;
let placementPrompted = false;
let placementCandidate = null;
let placementPointerId = null;
let wasPlacementMode = false;
let dirtyHUD = true;
let fineAimSteps = 0;
let cueSpin = 0; // -1: draw, 0: centre, +1: follow
let pointerStroke = null;
let strokeAnimation = null;
let mode = 'practice'; // Solo challenge is opt-in; free practice stays the default.
let solo = newSoloChallenge(readSoloBest());
let soloShotEvents = [];
let soloShotStarted = false;
let availableUpdate = false;
const soundFX = createBilliardsAudio();
const feedbackGate = createFeedbackGate();
function syncSoundButton() {
  const enabled = soundFX.isEnabled();
  soundToggle.dataset.enabled = String(enabled);
  soundToggle.setAttribute('aria-pressed', String(enabled));
  soundToggle.setAttribute('aria-label',
    enabled ? 'Silenciar efectos de sonido' : 'Activar efectos de sonido');
  soundToggle.title = enabled ? 'Efectos sonoros activados' : 'Efectos sonoros desactivados';
  soundToggle.textContent = enabled ? '🔊' : '🔇';
}
soundToggle.addEventListener('click', () => {
  soundFX.setEnabled(!soundFX.isEnabled());
  syncSoundButton();
});
syncSoundButton();
function updateNoticeIsSafe() {
  return canShowUpdateNotice({
    moving: ballsMoving(balls),
    charging: charge.active,
    pointerStroke: Boolean(pointerStroke),
    strokeAnimation: Boolean(strokeAnimation),
  });
}
const versionWatcher = createVersionWatcher({
  // Vite injects this exact source SHA into the immutable CI build. The
  // authenticated release.json then compares *deployed* vs *running* code.
  sourceSha: import.meta.env.VITE_SOURCE_SHA || null,
  isVisible: () => !document.hidden,
  onAvailable: () => {
    availableUpdate = true;
    // Wait for the entire stroke, including hold/release and recoil.
    if (updateNoticeIsSafe()) updateBanner.hidden = false;
  },
});
updateLater.addEventListener('click', () => {
  updateBanner.hidden = true;
  availableUpdate = false;
});
updateNow.addEventListener('click', () => {
  if (!updateNoticeIsSafe()) return; // An active stroke is never interrupted.
  window.location.reload(); // Explicit click, game state currently resets.
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void versionWatcher.check();
});
window.addEventListener('focus', () => void versionWatcher.check());

function setFineAngleDisplay() {
  const change = fineAimSteps * FINE_AIM_STEP_DEGREES;
  const prefix = change > 0 ? '+' : change < 0 ? '−' : '';
  fineAngle.textContent = prefix + Math.abs(change).toFixed(1).replace('.', ',') + '°';
}
function nudgeAim(direction) {
  if (ballsMoving(balls) || balls[0].pocketed) return;
  const rotated = rotateAim(aim.x, aim.z, direction * FINE_AIM_STEP_DEGREES);
  if (!rotated) return;
  aim.set(rotated.x, 0, rotated.z);
  hasAimed = true;
  fineAimSteps += direction;
  setFineAngleDisplay();
}
fineLeft.addEventListener('click', () => nudgeAim(-1));
fineRight.addEventListener('click', () => nudgeAim(1));
const spinChoices = [
  { value: 0, label: '● Centro', name: 'centro' },
  { value: 1, label: '↑ Sigue', name: 'seguimiento' },
  { value: -1, label: '↓ Retro', name: 'retroceso' },
];
function updateSpinButton() {
  const choice = spinChoices.find((item) => item.value === cueSpin);
  spinButton.querySelector('.spin-name').textContent =
    choice.value === 0 ? 'Centro' : choice.value > 0 ? 'Sigue' : 'Retro';
  spinButton.dataset.spin = String(choice.value);
  spinButton.setAttribute('aria-label', 'Efecto de la blanca: ' + choice.name + '. Pulsa para cambiar');
  spinButton.title = 'Efecto de la blanca: ' + choice.name + ' · pulsa para cambiar';
}
spinButton.addEventListener('click', () => {
  if (ballsMoving(balls) || balls[0].pocketed) return;
  const index = spinChoices.findIndex((item) => item.value === cueSpin);
  cueSpin = spinChoices[(index + 1) % spinChoices.length].value;
  updateSpinButton();
});
updateSpinButton();

function say(message) { commentary.textContent = message; }

function syncSoloUI() {
  const challenge = mode === 'solo';
  modePractice.setAttribute('aria-pressed', String(!challenge));
  modeSolo.setAttribute('aria-pressed', String(challenge));
  soloStatus.hidden = !challenge;
  tableLabel.hidden = challenge;
  viewport.dataset.gameMode = challenge ? 'solo' : 'practice';
  if (!challenge) return;
  const best = solo.best
    ? 'Récord: ' + solo.best.shots + ' tiros' +
      (solo.best.scratches ? ' · ' + solo.best.scratches + ' faltas' : '')
    : 'Sin récord';
  soloStatus.textContent = solo.completed
    ? (solo.record ? '🏆 ¡Nuevo récord!' : '✓ Mesa limpia') +
      ' · ' + solo.shots + ' tiros · ' + best
    : '🎱 Desafío 15 · ' + solo.remaining + ' restantes · racha ' +
      solo.streak + ' · ' + best;
  soloStatus.dataset.shots = String(solo.shots);
  soloStatus.dataset.remaining = String(solo.remaining);
  soloStatus.dataset.scratches = String(solo.scratches);
  soloStatus.dataset.streak = String(solo.streak);
  soloStatus.dataset.completed = String(solo.completed);
  soloStatus.dataset.outcome = solo.last.kind;
  soloStatus.dataset.record = String(solo.record);
}
function changeMode(next) {
  if (mode === next || ballsMoving(balls) || charge.active) return;
  mode = next;
  restart();
  say(next === 'solo'
    ? 'Matthias: Quince bolas. ¿Cuántos tiros necesitas para limpiar la mesa?'
    : 'Matthias: Práctica libre. Aquí puedes seguir haciendo el ridículo a tu ritmo.');
}
modePractice.addEventListener('click', () => changeMode('practice'));
modeSolo.addEventListener('click', () => changeMode('solo'));
function formatScore() {
  shotDisplay.textContent = String(shots).padStart(2, '0');
  pocketDisplay.innerHTML = String(potted).padStart(2, '0') +
    ' <small>· ' + remainingObjectBalls(balls) + ' en mesa</small>';
}
function restart() {
  // New rack and mode changes never inherit an old cropped view.
  if (precisionZoom) {
    precisionZoom = false;
    syncTopFraming();
  }
  panPointer = null;
  viewport.dataset.panning = '';
  cancelCharge();
  feedbackGate.reset();
  for (const pulse of pocketPulses) pulse.ring.visible = false;
  strokeAnimation = null;
  balls = createRack();
  solo = newSoloChallenge(readSoloBest() ?? solo.best);
  soloShotEvents = [];
  soloShotStarted = false;
  shots = 0;
  potted = 0;
  scratchPending = false;
  placementPrompted = false;
  placementCandidate = null;
  placementPointerId = null;
  wasMoving = false;
  dirtyHUD = true;
  fineAimSteps = 0;
  hasAimed = false;
  syncTargetLens(null);
  setFineAngleDisplay();
  cueSpin = 0;
  updateSpinButton();
  syncSoloUI();
  say('Matthias: Otra oportunidad de desafiar a la geometría. Adelante, campeón.');
}
function placeWhiteInHand(x, z) {
  if (!scratchPending || !respawnCue(balls, x, z)) return false;
  scratchPending = false;
  placementPrompted = false;
  placementCandidate = null;
  // The challenge's actual scratch was already counted at shot settle.
  say('Matthias: Blanca colocada. Ahora intenta no volver a perderla.');
  return true;
}
function shoot(power = Number(powerInput.value) / 100) {
  if (mode === 'solo' && solo.completed) return;
  const cue = balls[0];
  const shotPosition = { x: cue.x, z: cue.z, dx: aim.x, dz: aim.z };
  if (strikeCue(balls, aim.x, aim.z, power, cueSpin)) {
    // WebAudio is created only by a real user shot, never at page load.
    soundFX.unlock();
    soundFX.play('strike', power);
    if (mode === 'solo') {
      soloShotStarted = true;
      soloShotEvents = [];
    }
    strokeAnimation = { ...shotPosition, at: performance.now(), power };
    shots++;
    dirtyHUD = true;
    say(['Matthias: Veamos si la física está de tu parte.',
      'Matthias: La precisión es una virtud. En tu caso, una aspiración.',
      'Matthias: Interesante. Un experimento con consecuencias.',
      'Matthias: Jawohl. Que las bandas decidan tu destino.'][shots % 4]);
  }
}
// Pointer controls share the same charge waveform as SPACE. A quick tap still
// fires with the chosen slider power; holding makes the stroke tactile on touch.
strikeButton.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || strikeButton.disabled || charge.active) return;
  if (scratchPending) { placeWhiteInHand(); return; }
  const now = performance.now();
  if (!charge.start(now)) return;
  pointerStroke = { id: event.pointerId, started: now, preset: Number(powerInput.value) / 100 };
  strikeButton.setPointerCapture(event.pointerId);
  powerInput.classList.add('charging');
  strikeButton.classList.add('charging');
});
strikeButton.addEventListener('pointerup', (event) => {
  if (!pointerStroke || pointerStroke.id !== event.pointerId) return;
  const held = pointerStroke;
  const now = performance.now();
  const rect = strikeButton.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  const charged = charge.release(now);
  pointerStroke = null;
  powerInput.classList.remove('charging');
  strikeButton.classList.remove('charging');
  if (!inside) { paintPower(held.preset * 100); return; }
  const power = resolveStrokePower(now - held.started, held.preset, charged);
  paintPower(power * 100);
  if (power > 0) shoot(power);
});
strikeButton.addEventListener('pointercancel', cancelCharge);
strikeButton.addEventListener('lostpointercapture', () => {
  if (pointerStroke) cancelCharge();
});
// Keyboard and accessibility activation produce click(detail=0), not a
// pointer release; never fire twice after a mouse/touch pointerup.
strikeButton.addEventListener('click', (event) => {
  if (event.detail === 0) {
    if (scratchPending) placeWhiteInHand();
    else shoot();
  }
});
strikeButton.addEventListener('contextmenu', (event) => event.preventDefault());
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
  if (pointerStroke) paintPower(pointerStroke.preset * 100);
  pointerStroke = null;
  charge.cancel();
  powerInput.classList.remove('charging');
  strikeButton.classList.remove('charging');
}
window.addEventListener('keydown', (event) => {
  // Keep native Space activation for focused buttons/sliders (including camera controls).
  if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement ||
      event.altKey || event.ctrlKey || event.metaKey) return;
  // Shift + arrows pan the precision camera; unmodified arrows keep their
  // original 0.5-degree aiming contract. No shot or physics calls here.
  if (precisionZoom && camera === topCamera && event.shiftKey &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const shift = 0.25;
    movePrecisionCamera(event.key === 'ArrowRight' ? shift :
      event.key === 'ArrowLeft' ? -shift : 0,
      event.key === 'ArrowDown' ? shift :
      event.key === 'ArrowUp' ? -shift : 0);
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat && !ballsMoving(balls) && !balls[0].pocketed) {
      if (charge.start(performance.now())) {
        powerInput.classList.add('charging');
        strikeButton.classList.add('charging');
      }
    }
    return;
  }
  if (!event.repeat && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    nudgeAim(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (!event.repeat && event.key.toLowerCase() === 'r') restart();
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space' || !charge.active || pointerStroke) return;
  event.preventDefault();
  const power = charge.release(performance.now());
  powerInput.classList.remove('charging');
  strikeButton.classList.remove('charging');
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
function pointAim(event, commitPlacement = false) {
  if (ballsMoving(balls)) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1);
  ray.setFromCamera(pointer, camera);
  if (!ray.ray.intersectPlane(clothPlane, point)) return;
  if (scratchPending) {
    const valid = canPlaceCueOnTable(balls, point.x, point.z);
    placementCandidate = { x: point.x, z: point.z, valid };
    if (commitPlacement && valid) placeWhiteInHand(point.x, point.z);
    return;
  }
  if (balls[0].pocketed) return;
  const dx = point.x - balls[0].x;
  const dz = point.z - balls[0].z;
  if (Math.hypot(dx, dz) < TABLE.ballRadius * 2) return;
  aim.set(dx, 0, dz).normalize();
  hasAimed = true;
  // Direct pointer aiming establishes a new baseline for fine adjustments.
  fineAimSteps = 0;
  setFineAngleDisplay();
}
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
function finishPan(event) {
  if (panPointer?.id !== event.pointerId) return false;
  panPointer = null;
  viewport.dataset.panning = '';
  return true;
}
canvas.addEventListener('contextmenu', (event) => {
  if (precisionZoom && camera === topCamera) event.preventDefault();
});
canvas.addEventListener('pointerdown', (event) => {
  // Pan gestures never call pointAim, including on pointerdown: preserving
  // the exact aim direction is more important than responding to hover.
  if (precisionZoom && camera === topCamera && event.pointerType === 'mouse' &&
      (event.button === 2 || (event.button === 0 && event.shiftKey))) {
    if (panPointer) return;
    panPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dragging = false;
    viewport.dataset.panning = 'active';
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (event.button !== 0 || panPointer) return;
  dragging = true;
  if (scratchPending) placementPointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  pointAim(event, scratchPending);
});
canvas.addEventListener('pointermove', (event) => {
  if (panPointer) {
    if (panPointer.id !== event.pointerId) return;
    const dx = event.clientX - panPointer.x;
    const dy = event.clientY - panPointer.y;
    panPointer.x = event.clientX;
    panPointer.y = event.clientY;
    // The mouse drags the TABLE, so camera motion is the inverse delta.
    // The world-per-pixel conversion comes from the real Three.js frustum.
    const rect = canvas.getBoundingClientRect();
    movePrecisionCamera(-dx * (topCamera.right - topCamera.left) /
      (rect.width * topCamera.zoom),
      -dy * (topCamera.top - topCamera.bottom) /
      (rect.height * topCamera.zoom));
    event.preventDefault();
    return;
  }
  if (precisionZoom && camera === topCamera &&
      event.pointerType === 'mouse' && event.shiftKey) return;
  // Do not accidentally re-aim while the finger that placed the white is held.
  if (placementPointerId !== null && !scratchPending) return;
  if (event.pointerType === 'mouse' || dragging) pointAim(event);
});
canvas.addEventListener('pointerup', (event) => {
  if (finishPan(event)) return;
  if (placementPointerId === event.pointerId) {
    if (scratchPending) pointAim(event, true);
    placementPointerId = null;
  }
  dragging = false;
});
canvas.addEventListener('pointercancel', (event) => {
  finishPan(event);
  dragging = false;
  placementPointerId = null;
});
canvas.addEventListener('lostpointercapture', (event) => finishPan(event));

// On narrow portrait screens the physical balls are only a few pixels wide.
// Show the actual *first predicted contact* enlarged in the side gutter,
// without changing any ball/collider sizes, covering the cloth, or inventing
// a target when the path hits a cushion or jaw. The badge is never clickable.
const projectedTarget = new THREE.Vector3();
function syncTargetLens(id) {
  const portrait = window.matchMedia('(max-width: 700px) and (min-height: 700px)').matches;
  if (!portrait || !hasAimed || !Number.isInteger(id) || id < 1 || id > OBJECT_BALL_COUNT) {
    if (!targetLens.hidden) targetLens.hidden = true;
    lastLensTarget = null;
    return;
  }
  const target = balls.find((ball) => ball.id === id && !ball.pocketed);
  if (!target) {
    targetLens.hidden = true;
    lastLensTarget = null;
    return;
  }
  const changed = lastLensTarget !== id;
  if (changed) {
    const spec = poolBallSpec(id);
    targetBallNumber.textContent = String(id).padStart(2, '0');
    targetLens.style.setProperty('--ball-color', spec.color);
    targetLens.dataset.striped = String(spec.striped);
    targetLens.dataset.ballId = String(id);
    targetLens.setAttribute('aria-label', 'Primer contacto previsto: bola ' + id);
    lastLensTarget = id;
    targetLens.hidden = false;
  }
  if (!changed && !lensPositionDirty) return;
  projectedTarget.set(target.x, TABLE.ballRadius + 0.052, target.z).project(camera);
  // The 62px lens lives in the side gutter, opposite the projected ball.
  // Vertical position follows the ball but never overlaps the top controls.
  targetLens.dataset.side = projectedTarget.x >= 0 ? 'left' : 'right';
  const height = viewport.clientHeight;
  const minTop = mode === 'solo' ? 91 : 55;
  const y = (1 - projectedTarget.y) * height / 2 - 28;
  targetLens.style.top = Math.round(Math.max(minTop, Math.min(height - 72, y))) + 'px';
  lensPositionDirty = false;
}

function updateCue(now) {
  const cue = balls[0];
  ghostRing.visible = false;
  impactDot.visible = false;
  placementGhost.visible = scratchPending && !ballsMoving(balls) && Boolean(placementCandidate);
  if (placementGhost.visible) {
    placementGhost.position.set(placementCandidate.x, TABLE.ballRadius + 0.052, placementCandidate.z);
    placementGhost.material.color.setHex(placementCandidate.valid ? 0xf6e8be : 0xe86464);
  }
  viewport.dataset.aimTarget = '';
  viewport.dataset.aimJaw = '';
  // Shot physics already starts in shoot(); the stick is pure presentation.
  // Three distinct beats: quick contact, restrained recoil, quiet recovery.
  viewport.dataset.cueCharge = charge.active ? 'active' : '';
  if (strokeAnimation) {
    const { x, z, dx, dz, power } = strokeAnimation;
    const pose = cueStrokePose(now - strokeAnimation.at, power, reducedCueMotion.matches);
    if (pose) {
      const offset = CUE_TIP_LOCAL_X + TABLE.ballRadius + pose.gap;
      cueStick.position.set(x - dx * offset, TABLE.ballRadius + 0.052 + pose.lift, z - dz * offset);
      cueStick.rotation.y = -Math.atan2(dz, dx);
      cueStick.visible = true;
      guide.visible = false;
      viewport.dataset.stroke = 'active';
      viewport.dataset.strokePhase = pose.phase;
      syncTargetLens(null);
      return;
    }
    strokeAnimation = null;
  }
  viewport.dataset.stroke = '';
  viewport.dataset.strokePhase = '';
  const available = !cue.pocketed && !ballsMoving(balls);
  cueStick.visible = available;
  guide.visible = available;
  if (!available) { syncTargetLens(null); return; }
  // Charging visibly draws the cue back; it never moves the cue-ball.
  const offset = CUE_TIP_LOCAL_X + TABLE.ballRadius +
    cueIdleGap(Number(powerInput.value) / 100, charge.active);
  cueStick.position.set(cue.x - aim.x * offset, TABLE.ballRadius + 0.052, cue.z - aim.z * offset);
  cueDirection.copy(aim);
  cueStick.rotation.y = -Math.atan2(aim.z, aim.x);
  const preview = predictFirstContact(balls, aim.x, aim.z);
  if (!preview) { guide.visible = false; syncTargetLens(null); return; }
  syncTargetLens(preview.ballId);
  const start = Math.min(preview.distance, TABLE.ballRadius * 1.2);
  const front = new THREE.Vector3(cue.x + aim.x * start, 0.095, cue.z + aim.z * start);
  const end = new THREE.Vector3(preview.x, 0.095, preview.z);
  guide.geometry.setFromPoints([front, end]);
  guide.computeLineDistances();
  if (preview.ballId !== null) {
    const target = balls.find((ball) => ball.id === preview.ballId);
    ghostRing.position.set(preview.x, 0.102, preview.z);
    ghostRing.visible = true;
    // The contact lies halfway between the centres of two equal-radius balls,
    // not necessarily on the aim axis when playing a cut.
    impactDot.position.set((preview.x + target.x) / 2, TABLE.ballRadius + 0.057,
      (preview.z + target.z) / 2);
    impactDot.visible = true;
    viewport.dataset.aimTarget = String(preview.ballId);
  } else if (preview.jawIndex !== null) {
    // Show a tiny amber mark where the white will first graze the felt jaw.
    const jaw = POCKET_JAWS[preview.jawIndex];
    const share = jaw.radius / (jaw.radius + TABLE.ballRadius);
    impactDot.position.set(
      jaw.x + (preview.x - jaw.x) * share,
      TABLE.ballRadius + 0.052,
      jaw.z + (preview.z - jaw.z) * share,
    );
    impactDot.visible = true;
    viewport.dataset.aimJaw = String(preview.jawIndex);
  }
}

// Each camera fits the tabletop within the clear viewport, excluding the HUD.
 // The orthographic view makes aiming distances visually consistent.
const tableCorners = [];
for (const x of [-4.75, 4.75]) {
  for (const y of [-0.12, 0.28]) {
    for (const z of [-2.51, 2.51]) tableCorners.push(new THREE.Vector3(x, y, z));
  }
}
const projectedCorner = new THREE.Vector3();
function movePrecisionCamera(dxWorld, dzWorld) {
  if (!precisionZoom || camera !== topCamera) return;
  precisionAnchor = panPrecisionFocus(precisionAnchor, dxWorld, dzWorld,
    TABLE.halfX, TABLE.halfZ);
  syncTopFraming();
  lensPositionDirty = true;
}
function syncTopFraming() {
  const focus = precisionZoom ? precisionAnchor : { x: 0, z: 0 };
  topCamera.zoom = precisionZoom ? PRECISION_ZOOM : 1;
  topCamera.position.set(focus.x, 20, focus.z);
  topCamera.lookAt(focus.x, 0, focus.z);
  topCamera.updateProjectionMatrix();
  topCamera.updateMatrixWorld();
  viewport.dataset.zoom = precisionZoom ? 'precision' : 'full';
  viewport.dataset.cameraFocusX = precisionZoom ? focus.x.toFixed(3) : '0.000';
  viewport.dataset.cameraFocusZ = precisionZoom ? focus.z.toFixed(3) : '0.000';
  precisionZoomButton.setAttribute('aria-pressed', String(precisionZoom));
  precisionZoomButton.textContent = precisionZoom ? 'Ver mesa' : 'Zoom ×1,4';
  precisionZoomButton.setAttribute('aria-label', precisionZoom
    ? 'Restaurar vista completa de la mesa' : 'Acercar la mesa 1,4 veces en vista cenital');
  precisionZoomButton.title = precisionZoom
    ? 'Arrastra con botón derecho o Mayús + ratón · Mayús + flechas para mover · pulsa para ver la mesa'
    : 'Ampliar la puntería sin alterar el tiro';
}
function resize() {
  const rect = viewport.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  // Resizing the WebGL drawing buffer clears its pixels. On mobile, changing
  // Matthias's commentary changes the panel height (and the viewport), so a
  // screenshot or a real display refresh could observe only the dark page
  // background before the next costly software/phone GPU frame.
  const sizeChanged = renderer.getPixelRatio() !== pixelRatio ||
    renderer.domElement.width !== Math.floor(width * pixelRatio) ||
    renderer.domElement.height !== Math.floor(height * pixelRatio);
  if (sizeChanged) {
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
  }
  const aspect = width / height;
  const portrait = width <= 700 && height > width * 1.15;

  // Desktop: baulk to the left. Portrait: turn the tabletop lengthwise.
  // Orthographic scaling is determined by *both* axes and the available viewport.
  const halfWorldWidth = portrait ? 2.51 : 4.75;
  const halfWorldHeight = portrait ? 4.75 : 2.51;
  const halfHeight = Math.max(halfWorldHeight / TOP_CAMERA_FILL,
    halfWorldWidth / (aspect * TOP_CAMERA_FILL));
  topCamera.left = -halfHeight * aspect;
  topCamera.right = halfHeight * aspect;
  topCamera.top = halfHeight;
  topCamera.bottom = -halfHeight;
  topCamera.up.set(portrait ? 1 : 0, 0, portrait ? 0 : -1);
  syncTopFraming();

  // Keep the existing cinema-style perspective fitting for the 3D option.
  perspectiveCamera.aspect = aspect;
  perspectiveCamera.up.set(portrait ? 1 : 0, portrait ? 0 : 1, 0);
  perspectiveCamera.updateProjectionMatrix();
  const target = new THREE.Vector3(0, -0.04, 0);
  const direction = portrait
    ? new THREE.Vector3(0, 0.87, 0.50).normalize()
    : new THREE.Vector3(-0.06, 0.77, 0.72).normalize();
  function fits(distance) {
    perspectiveCamera.position.copy(direction).multiplyScalar(distance).add(target);
    perspectiveCamera.lookAt(target);
    perspectiveCamera.updateMatrixWorld();
    return tableCorners.every((corner) => {
      projectedCorner.copy(corner).project(perspectiveCamera);
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
  lensPositionDirty = true;
  // Paint immediately with the freshly fitted camera when the drawing buffer
  // actually changes size. Physics remains exclusively in the fixed-step RAF.
  // No work is done for repeated ResizeObserver notifications of equal size.
  if (sizeChanged) renderer.render(scene, camera);
}
function setCameraMode(mode) {
  if (mode === '3d' && precisionZoom) {
    precisionZoom = false;
    panPointer = null;
    viewport.dataset.panning = '';
    syncTopFraming();
  }
  camera = mode === '3d' ? perspectiveCamera : topCamera;
  lensPositionDirty = true;
  scene.fog = mode === '3d' ? perspectiveFog : null;
  viewport.dataset.camera = mode;
  topCameraButton.setAttribute('aria-pressed', String(mode === 'top'));
  perspectiveCameraButton.setAttribute('aria-pressed', String(mode === '3d'));
}
topCameraButton.addEventListener('click', () => setCameraMode('top'));
perspectiveCameraButton.addEventListener('click', () => setCameraMode('3d'));
precisionZoomButton.addEventListener('click', () => {
  if (!precisionZoom) {
    const cue = balls[0]?.pocketed ? null : balls[0];
    const prediction = cue && !ballsMoving(balls)
      ? predictFirstContact(balls, aim.x, aim.z) : null;
    const target = prediction?.ballId == null ? null
      : balls.find((ball) => ball.id === prediction.ballId && !ball.pocketed);
    precisionAnchor = precisionFocus(cue, target);
  }
  precisionZoom = !precisionZoom;
  panPointer = null;
  viewport.dataset.panning = '';
  setCameraMode('top');
  syncTopFraming();
  lensPositionDirty = true;
});
// Position the phone playfield against the *real* control panel height.
// Commentary can wrap to more lines on smaller phones. A fixed CSS bottom
// caused an actual 4 px overlap at 390 px even though visual mockups fit.
// This uses content geometry, not guessed device offsets, and also keeps the
// protected update notice above the buttons whenever it is displayed.
const controlPanel = document.querySelector('.bottom-panel');
function keepMobileTableClear() {
  const portraitUI = window.matchMedia('(max-width: 700px) and (min-height: 700px)').matches;
  if (!portraitUI) {
    viewport.style.removeProperty('bottom');
    updateBanner.style.removeProperty('bottom');
    return;
  }
  const panelTop = controlPanel.getBoundingClientRect().top;
  const bottom = Math.max(195, Math.ceil(window.innerHeight - panelTop + 10));
  viewport.style.bottom = bottom + 'px';
  updateBanner.style.bottom = (bottom + 10) + 'px';
}
new ResizeObserver(keepMobileTableClear).observe(controlPanel);
window.addEventListener('resize', keepMobileTableClear);
keepMobileTableClear();
new ResizeObserver(resize).observe(viewport);
resize();
setCameraMode('top');

let lastFrame = performance.now();
let accumulator = 0;
const FIXED_DT = 1 / 120;
function frame(now) {
  if (charge.active) paintPower(charge.sample(now) * 100);
  // Keep the *same* deterministic 120 Hz physics while letting simulation
  // catch up after slower WebGL renders. The previous 50 ms/7-step ceiling
  // made 2-second strokes last tens of seconds on software GPU and mobile.
  const elapsed = Math.min((now - lastFrame) / 1000, 0.20);
  lastFrame = now;
  accumulator += elapsed;
  let n = 0;
  while (accumulator >= FIXED_DT && n++ < 26) {
    const events = stepPhysics(balls, FIXED_DT, { trackContacts: true });
    for (const feedback of feedbackGate.consume(events, now))
      soundFX.play(feedback.type, feedback.strength);
    if (mode === 'solo' && soloShotStarted) soloShotEvents.push(...events);
    for (const event of events) {
      if (event.type === 'scratch' || event.type === 'potted') flashPocket(event, now);
      if (event.type === 'scratch') {
        scratchPending = true;
        placementPrompted = false;
        placementCandidate = null;
        say('Matthias: Has metido la blanca. Wunderbar. Espera a que se detengan las bolas.');
      } else if (event.type === 'potted') {
        potted++;
        dirtyHUD = true;
        say('Matthias: Una bola embocada. Debe de haber sido accidental.');
      }
    }
    accumulator -= FIXED_DT;
  }
  const nowMoving = ballsMoving(balls);
  if (!nowMoving && wasMoving && mode === 'solo' && soloShotStarted) {
    const actualPots = soloShotEvents
      .filter((event) => event.type === 'potted').map((event) => event.id);
    const scratch = soloShotEvents.some((event) => event.type === 'scratch');
    solo = settleSoloShot(solo, {
      pottedIds: actualPots, scratch, remaining: remainingObjectBalls(balls),
    });
    soloShotStarted = false;
    soloShotEvents = [];
    if (solo.completed) {
      if (solo.record) saveSoloBest(solo.best);
      say(solo.record
        ? 'Matthias: ¡Mesa limpia en ' + solo.shots + ' tiros! Nuevo récord. Admitiré que es respetable.'
        : 'Matthias: Mesa limpia en ' + solo.shots + ' tiros. La próxima vez, supera tu marca.');
    } else if (solo.last.kind === 'scratch') {
      say('Matthias: Blanca embocada. Falta registrada. Tu racha, al cementerio.');
    } else if (solo.last.kind === 'multi') {
      say('Matthias: ' + solo.last.balls + ' bolas en un tiro. Una rareza estadísticamente agradable.');
    } else if (solo.last.kind === 'pot' && solo.streak >= 2) {
      say('Matthias: ' + solo.streak + ' tiros embocando seguidos. Empiezo a preocuparme.');
    } else if (solo.last.kind === 'miss') {
      say('Matthias: Un tiro y ninguna bola. El billar sigue invicto.');
    }
    syncSoloUI();
    dirtyHUD = true;
  }
  if (!nowMoving) {
    // Pool object balls stay pocketed; no snooker colour respotting.
    if (scratchPending && !placementPrompted) {
      placementPrompted = true;
      say('Matthias: Blanca en mano. Elige un hueco libre en la mesa, o pulsa COLOCAR.');
    }
    if (wasMoving && mode === 'practice' && !scratchPending && remainingObjectBalls(balls) === 0) {
      say('Matthias: Todas dentro. Me veo obligado, muy a mi pesar, a felicitarte.');
    }
  }
  wasMoving = nowMoving;
  modePractice.disabled = nowMoving || charge.active;
  modeSolo.disabled = nowMoving || charge.active;
  // If the user starts another stroke while the prompt is open, move it out
  // of the way. Reveal it again only after the cue and balls settle.
  if (availableUpdate) updateBanner.hidden = !updateNoticeIsSafe();
  if (dirtyHUD) { formatScore(); dirtyHUD = false; }
  if (scratchPending !== wasPlacementMode) {
    wasPlacementMode = scratchPending;
    strikeButton.innerHTML = scratchPending
      ? '<span>◌</span> COLOCAR'
      : '<span>⚡</span> GOLPEAR <kbd>ESPACIO</kbd>';
    const aria = scratchPending
      ? 'Colocar blanca automáticamente en un punto libre de la mesa'
      : 'Golpear: toca para usar la potencia elegida, mantén pulsado para cargar';
    strikeButton.setAttribute('aria-label', aria);
    strikeButton.title = aria;
  }
  viewport.dataset.cuePlacement = scratchPending ? 'required' : '';
  strikeButton.disabled = wasMoving || (balls[0].pocketed && !scratchPending) ||
    (mode === 'solo' && solo.completed);
  spinButton.disabled = wasMoving || balls[0].pocketed;
  fineLeft.disabled = spinButton.disabled;
  fineRight.disabled = spinButton.disabled;
  for (const b of balls) {
    const model = models.get(b.id);
    model.visible = !b.pocketed;
    model.position.set(b.x, TABLE.ballRadius + 0.052, b.z);
  }
  // Only an idle cue gets the visible aiming marker; moving/pocketed balls
  // retain exactly the same sphere geometry and collision behaviour.
  models.get(0).userData.cueRing.visible =
    !nowMoving && !balls[0].pocketed && !scratchPending;
  // Expose the real mesh state to browser E2E, not an unrelated UI flag.
  viewport.dataset.cueLocator = models.get(0).userData.cueRing.visible ? 'ready' : '';
  updateCue(now);
  animatePocketPulses(now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
syncSoloUI();
versionWatcher.start();
