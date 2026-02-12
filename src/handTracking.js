/**
 * handTracking.js
 * ────────────────
 * Integrates MediaPipe Hands to detect hand landmarks from the webcam.
 * Recognises 6 distinct gestures and exposes the index-finger-tip position.
 *
 * Gestures detected:
 *   ☝️  INDEX_UP   — solo índice arriba        → Planeta
 *   ✌️  PEACE      — índice + medio             → "Carolina"
 *   🤘 ROCK       — índice + meñique            → "Te Amo"
 *   🤟 ILY        — pulgar + índice + meñique   → Corazón
 *   🖐️  OPEN       — todos los dedos abiertos   → Cosmos / explosión
 *   ✊  FIST       — puño cerrado                → Comprimir
 *   null           — sin mano detectada
 */

import { Hands } from '@mediapipe/hands';

/* ─── Gesture constants ─── */
export const GESTURES = {
  INDEX_UP: 'INDEX_UP',
  PEACE:    'PEACE',
  ROCK:     'ROCK',
  ILY:      'ILY',
  OPEN:     'OPEN',
  FIST:     'FIST',
};

/* Emoji + label map for UI */
export const GESTURE_LABELS = {
  [GESTURES.INDEX_UP]: '☝️  Índice — Planeta',
  [GESTURES.PEACE]:    '✌️  Paz — Carolina',
  [GESTURES.ROCK]:     '🤘 Rock — Te Amo',
  [GESTURES.ILY]:      '🤟 Te Quiero — Corazón',
  [GESTURES.OPEN]:     '🖐️  Abierta — Cosmos',
  [GESTURES.FIST]:     '✊ Puño — Concentrar',
};

export class HandTracker {
  constructor() {
    /** Normalised finger position {x,y} or null */
    this.fingerPos = null;

    /** Current detected gesture name, or null */
    this.gesture = null;

    /** Whether the camera/model is active */
    this.active = false;

    this._video = null;
    this._hands = null;
    this._previewCtx = null;
    this._rafId = null;

    /** Debounce: require N consecutive identical detections to switch */
    this._gestureBuffer = null;
    this._gestureCount = 0;
    this._DEBOUNCE = 3;
  }

  /* ──────────────────────────────────────── */
  /*  Public API                              */
  /* ──────────────────────────────────────── */

  async start(previewCanvas, onStatus = () => {}) {
    if (this.active) return;

    onStatus('Solicitando cámara…');

    /* 1 – Open webcam */
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
    });

    this._video = document.createElement('video');
    this._video.srcObject = stream;
    this._video.playsInline = true;
    await this._video.play();

    /* 2 – Preview canvas */
    this._previewCtx = previewCanvas.getContext('2d');
    previewCanvas.style.display = 'block';

    /* 3 – MediaPipe Hands */
    onStatus('Cargando modelo MediaPipe…');

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    this._hands.onResults((results) => this._onResults(results));

    this.active = true;
    onStatus('✨ Haz gestos con tu mano');

    this._loop();
  }

  stop() {
    this.active = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._video?.srcObject) {
      this._video.srcObject.getTracks().forEach((t) => t.stop());
    }
    this.fingerPos = null;
    this.gesture = null;

    const preview = document.getElementById('camera-preview');
    if (preview) preview.style.display = 'none';
  }

  /* ──────────────────────────────────────── */
  /*  Gesture Recognition                     */
  /* ──────────────────────────────────────── */

  /**
   * Determine if a finger is extended.
   * For thumb, compare tip.x vs IP.x (lateral motion).
   * For other fingers, compare tip.y vs PIP.y (vertical).
   *
   * MediaPipe landmarks (per finger):
   *   Thumb:  1-CMC 2-MCP 3-IP 4-TIP
   *   Index:  5-MCP 6-PIP 7-DIP 8-TIP
   *   Middle: 9-MCP 10-PIP 11-DIP 12-TIP
   *   Ring:   13-MCP 14-PIP 15-DIP 16-TIP
   *   Pinky:  17-MCP 18-PIP 19-DIP 20-TIP
   */
  _isFingerExtended(landmarks, finger) {
    if (finger === 'thumb') {
      // Thumb: tip further from palm centre than IP joint
      const tip = landmarks[4];
      const ip  = landmarks[3];
      const mcp = landmarks[2];
      // Use x-distance — works for both left/right hands
      return Math.abs(tip.x - mcp.x) > Math.abs(ip.x - mcp.x) * 1.2;
    }

    const map = { index: [8, 6], middle: [12, 10], ring: [16, 14], pinky: [20, 18] };
    const [tipIdx, pipIdx] = map[finger];
    // In MediaPipe image coords, y=0 is top → tip.y < pip.y means extended
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  }

  _classifyGesture(landmarks) {
    const thumb  = this._isFingerExtended(landmarks, 'thumb');
    const index  = this._isFingerExtended(landmarks, 'index');
    const middle = this._isFingerExtended(landmarks, 'middle');
    const ring   = this._isFingerExtended(landmarks, 'ring');
    const pinky  = this._isFingerExtended(landmarks, 'pinky');

    const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;

    // 🤟 ILY — thumb + index + pinky (middle & ring curled)
    if (thumb && index && !middle && !ring && pinky) return GESTURES.ILY;

    // 🤘 Rock — index + pinky (no thumb, no middle, no ring)
    if (!thumb && index && !middle && !ring && pinky) return GESTURES.ROCK;

    // ✌️ Peace — index + middle (ring & pinky curled)
    if (index && middle && !ring && !pinky) return GESTURES.PEACE;

    // ☝️ Index up — only index extended
    if (index && !middle && !ring && !pinky && !thumb) return GESTURES.INDEX_UP;

    // 🖐️ Open hand — 4+ fingers extended
    if (extendedCount >= 4) return GESTURES.OPEN;

    // ✊ Fist — 0-1 fingers extended
    if (extendedCount <= 1) return GESTURES.FIST;

    return null;
  }

  /* ──────────────────────────────────────── */
  /*  Internal loop                           */
  /* ──────────────────────────────────────── */

  _loop() {
    if (!this.active) return;

    this._hands.send({ image: this._video }).then(() => {
      this._rafId = requestAnimationFrame(() => this._loop());
    });
  }

  _onResults(results) {
    /* Draw webcam preview */
    if (this._previewCtx && this._video) {
      const ctx = this._previewCtx;
      const c = ctx.canvas;
      ctx.save();
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(this._video, 0, 0, c.width, c.height);
      ctx.restore();
    }

    if (
      results.multiHandLandmarks &&
      results.multiHandLandmarks.length > 0
    ) {
      const lm = results.multiHandLandmarks[0];

      /* ── Finger position (index tip) ── */
      const tip = lm[8];
      this.fingerPos = {
        x: -(tip.x * 2 - 1),
        y: -(tip.y * 2 - 1),
      };

      /* ── Gesture classification with debounce ── */
      const raw = this._classifyGesture(lm);
      if (raw === this._gestureBuffer) {
        this._gestureCount++;
      } else {
        this._gestureBuffer = raw;
        this._gestureCount = 1;
      }

      if (this._gestureCount >= this._DEBOUNCE) {
        this.gesture = raw;
      }

      /* ── Draw landmarks on preview ── */
      if (this._previewCtx) {
        this._drawLandmarks(lm);
      }
    } else {
      this.fingerPos = null;
      // Don't clear gesture instantly — keep last known for a beat
    }
  }

  /**
   * Draw hand skeleton + finger dots on the preview canvas.
   */
  _drawLandmarks(lm) {
    const ctx = this._previewCtx;
    const c = ctx.canvas;

    // Connections for skeleton lines
    const connections = [
      [0,1],[1,2],[2,3],[3,4],       // thumb
      [0,5],[5,6],[6,7],[7,8],       // index
      [0,9],[9,10],[10,11],[11,12],  // middle
      [0,13],[13,14],[14,15],[15,16],// ring
      [0,17],[17,18],[18,19],[19,20],// pinky
      [5,9],[9,13],[13,17],          // palm
    ];

    ctx.strokeStyle = 'rgba(255, 130, 180, 0.5)';
    ctx.lineWidth = 1.5;
    for (const [a, b] of connections) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height);
      ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height);
      ctx.stroke();
    }

    // Fingertip dots (4, 8, 12, 16, 20)
    const tips = [4, 8, 12, 16, 20];
    const colors = ['#ffb6c1', '#ff69b4', '#da70d6', '#ba55d3', '#e0b0ff'];
    for (let i = 0; i < tips.length; i++) {
      const t = lm[tips[i]];
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(t.x * c.width, t.y * c.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gesture label on preview
    if (this.gesture && GESTURE_LABELS[this.gesture]) {
      ctx.fillStyle = '#fff';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText(GESTURE_LABELS[this.gesture], 8, c.height - 10);
    }
  }
}
