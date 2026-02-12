/**
 * shaders.js
 * ----------
 * Custom vertex & fragment shaders for glowing star particles.
 * Each star has individual colour hue offsets and animated twinkle.
 */

export const starVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;

  attribute float aScale;
  attribute float aRandom;
  attribute vec3  aColor;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec4 modelPos  = modelMatrix  * vec4(position, 1.0);
    vec4 viewPos   = viewMatrix   * modelPos;
    vec4 projected = projectionMatrix * viewPos;
    gl_Position = projected;

    /*  Twinkle — each particle has its own flicker phase  */
    float twinkle = sin(uTime * (1.5 + aRandom * 3.0) + aRandom * 6.283) * 0.35 + 0.65;

    /*  Size attenuation (further = smaller)  */
    gl_PointSize = uSize * aScale * twinkle * uPixelRatio;
    gl_PointSize *= (1.0 / -viewPos.z);

    vColor = aColor;
    vAlpha = twinkle;
  }
`;

export const starFragmentShader = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    /*  Circular point with soft glow  */
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);

    /*  Discard outside circle  */
    if (dist > 0.5) discard;

    /*  Core + glow falloff  */
    float core = smoothstep(0.5, 0.05, dist);
    float glow = exp(-dist * 5.0) * 0.6;
    float brightness = core + glow;

    gl_FragColor = vec4(vColor * brightness, vAlpha * brightness);
  }
`;
