/**
 * textPoints.js
 * ─────────────
 * Uses Three.js FontLoader + TextGeometry to convert a string into a cloud
 * of 3D points.  Also generates a "sphere / chaos" formation for the idle
 * state and a heart shape.
 */
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

/* ─── CDN font (helvetiker — always available) ─── */
const FONT_URL =
  'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_bold.typeface.json';

let _font = null;

/**
 * Load the font once and cache it.
 * @returns {Promise<Font>}
 */
export function loadFont() {
  if (_font) return Promise.resolve(_font);

  return new Promise((resolve, reject) => {
    new FontLoader().load(
      FONT_URL,
      (font) => {
        _font = font;
        resolve(font);
      },
      undefined,
      reject,
    );
  });
}

/* ────────────────────────────────────────────────── */
/*  Formation generators                              */
/* ────────────────────────────────────────────────── */

/**
 * Sample `count` points along a text geometry surface.
 */
export function getTextPositions(text, count = 4000) {
  const geo = new TextGeometry(text, {
    font: _font,
    size: 3,
    depth: 0.4,           // era 'height' en versiones viejas
    curveSegments: 6,
    bevelEnabled: false,
  });
  geo.center();

  const positions = sampleSurface(geo, count);
  geo.dispose();
  return positions;
}

/**
 * Create a sphere / solar-system scatter.
 */
export function getSpherePositions(count = 4000, radius = 12) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * Math.cbrt(Math.random());   // uniform volume
    arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = r * Math.cos(phi);
  }
  return arr;
}

/**
 * Heart shape (2-D parametric → lifted to 3D with slight depth noise).
 */
export function getHeartPositions(count = 4000, scale = 0.7) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random() * Math.PI * 2;
    // parametric heart
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    const z = (Math.random() - 0.5) * 2;

    arr[i * 3]     = x * scale * 0.25;
    arr[i * 3 + 1] = y * scale * 0.25;
    arr[i * 3 + 2] = z * 0.3;
  }
  return arr;
}

/**
 * Compact / compressed cluster at origin (for fist gesture).
 */
export function getCompactPositions(count = 4000, radius = 1.2) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * Math.cbrt(Math.random());
    arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = r * Math.cos(phi);
  }
  return arr;
}

/**
 * Planet formation — a torus (ring like Saturn) + core sphere.
 */
export function getPlanetPositions(count = 4000) {
  const arr = new Float32Array(count * 3);
  const coreCount = Math.floor(count * 0.4);

  for (let i = 0; i < count; i++) {
    if (i < coreCount) {
      // Inner sphere (planet body)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.0 * Math.cbrt(Math.random());
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    } else {
      // Ring (torus)
      const angle = Math.random() * Math.PI * 2;
      const ringR = 4.0 + (Math.random() - 0.5) * 1.8;
      const y = (Math.random() - 0.5) * 0.3;
      arr[i * 3]     = Math.cos(angle) * ringR;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(angle) * ringR;
    }
  }
  return arr;
}

/* ────────────────────────────────────────────────── */
/*  Helpers                                           */
/* ────────────────────────────────────────────────── */

/**
 * Random point sampling on a triangulated mesh surface.
 * Returns Float32Array(count * 3).
 */
function sampleSurface(geometry, count) {
  const pos = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  const arr = new Float32Array(count * 3);

  // Build triangle list
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const areas = new Float32Array(triCount);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let totalArea = 0;

  for (let i = 0; i < triCount; i++) {
    const i0 = idx ? idx.getX(i * 3) : i * 3;
    const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;

    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);

    const area = new THREE.Triangle(a.clone(), b.clone(), c.clone()).getArea();
    areas[i] = area;
    totalArea += area;
  }

  // CDF for weighted random pick
  const cdf = new Float32Array(triCount);
  cdf[0] = areas[0] / totalArea;
  for (let i = 1; i < triCount; i++) cdf[i] = cdf[i - 1] + areas[i] / totalArea;

  for (let s = 0; s < count; s++) {
    const r = Math.random();
    let ti = 0;
    for (ti = 0; ti < triCount - 1; ti++) {
      if (r <= cdf[ti]) break;
    }

    const i0 = idx ? idx.getX(ti * 3) : ti * 3;
    const i1 = idx ? idx.getX(ti * 3 + 1) : ti * 3 + 1;
    const i2 = idx ? idx.getX(ti * 3 + 2) : ti * 3 + 2;

    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);

    // Random barycentric coords
    let u = Math.random(),
      v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;

    arr[s * 3]     = a.x * w + b.x * u + c.x * v;
    arr[s * 3 + 1] = a.y * w + b.y * u + c.y * v;
    arr[s * 3 + 2] = a.z * w + b.z * u + c.z * v;
  }
  return arr;
}
