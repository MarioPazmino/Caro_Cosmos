/**
 * main.js
 * ───────
 * Orchestrates the Valentine's experience:
 *   • Three.js scene (deep-space background, camera, renderer)
 *   • Particle system with 6 formations
 *   • Hand-gesture recognition → automatic formation switching
 *   • Mouse/touch fallback attractor
 *
 * Gesture → Formation map:
 *   ☝️  INDEX_UP  → Planeta (esfera con anillo)
 *   ✌️  PEACE     → Texto "Carolina"
 *   🤘 ROCK      → Texto "Te Quiero"
 *   🤟 ILY       → Corazón ❤️
 *   🖐️  OPEN      → Cosmos / esfera abierta
 *   ✊  FIST      → Concentrar (compactar)
 */
import './styles.css';

import * as THREE from 'three';
import { ParticleSystem } from './particles.js';
import {
  loadFont,
  getTextPositions,
  getSpherePositions,
  getHeartPositions,
  getCompactPositions,
  getPlanetPositions,
} from './textPoints.js';
import { HandTracker, GESTURES, GESTURE_LABELS } from './handTracking.js';

/* ────────────────────────────────────────────────── */
/*  DOM refs                                          */
/* ────────────────────────────────────────────────── */
const container     = document.getElementById('canvas-container');
const loadingEl     = document.getElementById('loading');
const uiEl          = document.getElementById('ui');
const titleEl       = document.getElementById('title');
const toggleBtn     = document.getElementById('toggle-btn');
const cameraBtn     = document.getElementById('camera-btn');
const statusEl      = document.getElementById('camera-status');
const cameraPreview = document.getElementById('camera-preview');
const gestureEl     = null; // removed from UI

/* ────────────────────────────────────────────────── */
/*  Three.js scene                                    */
/* ────────────────────────────────────────────────── */
const scene  = new THREE.Scene();
const camera3D = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera3D.position.set(0, 0, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x050008);
container.appendChild(renderer.domElement);

/* Deep-space subtle fog */
scene.fog = new THREE.FogExp2(0x050008, 0.015);

/* ────────────────────────────────────────────────── */
/*  Background star field (static, very far)          */
/* ────────────────────────────────────────────────── */
(function createBackgroundStars() {
  const count = 2000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 160;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 160;
    pos[i * 3 + 2] = -20 - Math.random() * 80;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
  });

  scene.add(new THREE.Points(geo, mat));
})();

/* ────────────────────────────────────────────────── */
/*  Particle system                                   */
/* ────────────────────────────────────────────────── */
const particles = new ParticleSystem();
scene.add(particles.mesh);

/* ────────────────────────────────────────────────── */
/*  Formations                                        */
/* ────────────────────────────────────────────────── */

/** Formation IDs (match gesture names for easy mapping) */
const F = {
  PLANET:   'PLANET',
  CAROLINA: 'CAROLINA',
  TEQUIERO: 'TEQUIERO',
  HEART:    'HEART',
  COSMOS:   'COSMOS',
  COMPACT:  'COMPACT',
};

/** Gesture → Formation */
const GESTURE_TO_FORMATION = {
  [GESTURES.INDEX_UP]: F.PLANET,
  [GESTURES.PEACE]:    F.CAROLINA,
  [GESTURES.ROCK]:     F.TEQUIERO,
  [GESTURES.ILY]:      F.HEART,
  [GESTURES.OPEN]:     F.COSMOS,
  [GESTURES.FIST]:     F.COMPACT,
};

/** Display info per formation */
const FORMATION_INFO = {
  [F.PLANET]:   { emoji: '🪐', label: 'Planeta',   title: '✨ Un planeta para ti ✨' },
  [F.CAROLINA]: { emoji: '💕', label: 'Carolina',  title: '💖 Carolina 💖' },
  [F.TEQUIERO]: { emoji: '🤘', label: 'Te Quiero', title: '💜 Te Quiero 💜' },
  [F.HEART]:    { emoji: '❤️', label: 'Corazón',    title: '❤️ Te Quiero ❤️' },
  [F.COSMOS]:   { emoji: '🌌', label: 'Cosmos',    title: '✨ Las estrellas son tuyas ✨' },
  [F.COMPACT]:  { emoji: '✊', label: 'Concentrar', title: '💫 Todo para ti 💫' },
};

let currentFormation = F.COSMOS;
const formationData = {};

async function precomputeFormations() {
  await loadFont();

  formationData[F.COSMOS]   = getSpherePositions(particles.count, 12);
  formationData[F.PLANET]   = getPlanetPositions(particles.count);
  formationData[F.CAROLINA] = getTextPositions('Carolina', particles.count);
  formationData[F.TEQUIERO] = getTextPositions('Te Quiero', particles.count);
  formationData[F.HEART]    = getHeartPositions(particles.count, 0.7);
  formationData[F.COMPACT]  = getCompactPositions(particles.count, 1.2);

  particles.setTarget(formationData[F.COSMOS]);
}

/**
 * Switch to a given formation (if not already active).
 */
function setFormation(id) {
  if (id === currentFormation) return;
  if (!formationData[id]) return;

  currentFormation = id;
  particles.setTarget(formationData[id]);

  const info = FORMATION_INFO[id];
  if (info) {
    titleEl.textContent = info.title;
  }
}

/**
 * Cycle through formations (button click).
 */
function cycleFormation() {
  const keys = Object.values(F);
  const idx = keys.indexOf(currentFormation);
  setFormation(keys[(idx + 1) % keys.length]);
}

/* ────────────────────────────────────────────────── */
/*  Hand tracking                                     */
/* ────────────────────────────────────────────────── */
const tracker = new HandTracker();
let _lastGesture = null;

async function toggleCamera() {
  if (tracker.active) {
    tracker.stop();
    cameraBtn.textContent = '📷 Activar Cámara';
    statusEl.textContent = '';
    if (gestureEl) gestureEl.textContent = '';
    return;
  }

  try {
    await tracker.start(cameraPreview, (msg) => {
      statusEl.textContent = msg;
    });
    cameraBtn.textContent = '🚫 Desactivar Cámara';
  } catch (err) {
    console.error(err);
    statusEl.textContent = '⚠️ No se pudo acceder a la cámara';
  }
}

/**
 * Check gesture each frame and switch formation when it changes.
 */
function processGesture() {
  if (!tracker.active) return;

  const g = tracker.gesture;

  // Update UI label
  if (gestureEl) {
    gestureEl.textContent = g ? (GESTURE_LABELS[g] || '') : '';
  }

  // Switch formation if gesture changed
  if (g && g !== _lastGesture) {
    const targetFormation = GESTURE_TO_FORMATION[g];
    if (targetFormation) {
      setFormation(targetFormation);
    }
  }
  _lastGesture = g;
}

/* ────────────────────────────────────────────────── */
/*  Mouse / touch fallback attractor                  */
/* ────────────────────────────────────────────────── */
const mouse = new THREE.Vector2(9999, 9999);

window.addEventListener('pointermove', (e) => {
  mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
});

window.addEventListener('pointerleave', () => {
  mouse.set(9999, 9999);
});

function getAttractorFromNDC(ndc) {
  const vec = new THREE.Vector3(ndc.x, ndc.y, 0.5);
  vec.unproject(camera3D);
  const dir = vec.sub(camera3D.position).normalize();
  const dist = -camera3D.position.z / dir.z;
  return camera3D.position.clone().add(dir.multiplyScalar(dist));
}

/* ────────────────────────────────────────────────── */
/*  Animation loop                                    */
/* ────────────────────────────────────────────────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  /* Process gesture → formation */
  processGesture();

  /* Attractor: hand > mouse */
  if (tracker.active && tracker.fingerPos) {
    particles.attractor = getAttractorFromNDC(tracker.fingerPos);
  } else if (mouse.x < 9000) {
    particles.attractor = getAttractorFromNDC(mouse);
  } else {
    particles.attractor = null;
  }

  /* Rotation — faster spin for planet, gentle sway for others */
  if (currentFormation === F.PLANET) {
    particles.mesh.rotation.y += 0.006;
    particles.mesh.rotation.x = Math.sin(elapsed * 0.15) * 0.25;
  } else {
    particles.mesh.rotation.y = Math.sin(elapsed * 0.1) * 0.3;
    particles.mesh.rotation.x = Math.sin(elapsed * 0.07) * 0.1;
  }

  particles.update(elapsed);
  renderer.render(scene, camera3D);
}

/* ────────────────────────────────────────────────── */
/*  Resize                                            */
/* ────────────────────────────────────────────────── */
window.addEventListener('resize', () => {
  camera3D.aspect = innerWidth / innerHeight;
  camera3D.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  particles.material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, 2);
});

/* ────────────────────────────────────────────────── */
/*  Boot                                              */
/* ────────────────────────────────────────────────── */
toggleBtn.addEventListener('click', cycleFormation);
cameraBtn.addEventListener('click', toggleCamera);

precomputeFormations().then(() => {
  loadingEl.classList.add('hidden');
  uiEl.style.display = '';
  animate();
});
