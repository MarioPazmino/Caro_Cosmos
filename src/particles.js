/**
 * particles.js
 * ─────────────
 * Manages the star particle system: BufferGeometry, custom ShaderMaterial,
 * lerp transitions between formations, and finger-attraction force.
 */
import * as THREE from 'three';
import { starVertexShader, starFragmentShader } from './shaders.js';

const PARTICLE_COUNT = 5000;

/* ─── Romantic colour palette ─── */
const PALETTE = [
  new THREE.Color('#ffffff'),  // white
  new THREE.Color('#ffb6c1'),  // light pink
  new THREE.Color('#ff69b4'),  // hot pink
  new THREE.Color('#da70d6'),  // orchid
  new THREE.Color('#ba55d3'),  // medium orchid
  new THREE.Color('#e0b0ff'),  // mauve
];

export class ParticleSystem {
  constructor() {
    this.count = PARTICLE_COUNT;

    /* Target positions the particles are lerp-ing towards */
    this._targetPositions = null;

    /* Lerp speed (0 = frozen, 1 = instant) */
    this.lerpSpeed = 0.08;

    /* Finger attractor (world-space vec3, null when inactive) */
    this.attractor = null;
    this.attractRadius = 4.0;
    this.attractStrength = 0.06;

    this._buildGeometry();
    this._buildMaterial();
    this.mesh = new THREE.Points(this.geometry, this.material);
  }

  /* ──────────────────────────────────────── */
  /*  Construction                            */
  /* ──────────────────────────────────────── */

  _buildGeometry() {
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(this.count * 3);
    const scales    = new Float32Array(this.count);
    const randoms   = new Float32Array(this.count);
    const colors    = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      /* Start at a random sphere position */
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 12 * Math.cbrt(Math.random());
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      scales[i]  = 0.5 + Math.random() * 1.5;
      randoms[i] = Math.random();

      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aScale',   new THREE.BufferAttribute(scales, 1));
    this.geometry.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 1));
    this.geometry.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  }

  _buildMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime:       { value: 0 },
        uSize:       { value: 80 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  /* ──────────────────────────────────────── */
  /*  Public API                              */
  /* ──────────────────────────────────────── */

  /**
   * Set a new target formation (Float32Array of length count*3).
   * If the incoming array has fewer/more points than count, it wraps / trims.
   */
  setTarget(targetArray) {
    const out = new Float32Array(this.count * 3);
    const srcLen = targetArray.length / 3;
    for (let i = 0; i < this.count; i++) {
      const si = (i % srcLen) * 3;
      out[i * 3]     = targetArray[si];
      out[i * 3 + 1] = targetArray[si + 1];
      out[i * 3 + 2] = targetArray[si + 2];
    }
    this._targetPositions = out;
  }

  /**
   * Called every frame.
   */
  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed;

    const posAttr = this.geometry.getAttribute('position');
    const pos = posAttr.array;

    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;

      /* 1) Lerp toward target formation */
      if (this._targetPositions) {
        pos[ix] += (this._targetPositions[ix] - pos[ix]) * this.lerpSpeed;
        pos[iy] += (this._targetPositions[iy] - pos[iy]) * this.lerpSpeed;
        pos[iz] += (this._targetPositions[iz] - pos[iz]) * this.lerpSpeed;
      }

      /* 2) Finger attractor force */
      if (this.attractor) {
        const dx = this.attractor.x - pos[ix];
        const dy = this.attractor.y - pos[iy];
        const dz = this.attractor.z - pos[iz];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < this.attractRadius && dist > 0.01) {
          const force = this.attractStrength * (1 - dist / this.attractRadius);
          pos[ix] += dx / dist * force;
          pos[iy] += dy / dist * force;
          pos[iz] += dz / dist * force;
        }
      }
    }

    posAttr.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
