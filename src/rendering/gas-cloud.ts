// Gas particle cloud — Stage 3b. Same shader scaffolding as
// `particle-cloud.ts` but the colour ramp is keyed to internal energy
// (a proxy for temperature) instead of poly6 density. Gas particles
// share the periodic box with DM but render as a separate THREE.Points
// system so a viewer can immediately tell baryons from dark matter.

import * as THREE from 'three';

const VERT_SHADER = /* glsl */ `
  attribute float aTemp;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uMaxScreenSize;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uTempMin;
  uniform float uTempMax;
  varying float vTempNorm;
  varying float vFade;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float perspective = uPointSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_PointSize = min(perspective, uMaxScreenSize * uPixelRatio);

    float lo = log(max(uTempMin, 1e-9));
    float hi = log(max(uTempMax, uTempMin * 1.000001));
    float v = (log(max(aTemp, 1e-9)) - lo) / max(hi - lo, 1e-6);
    vTempNorm = clamp(v, 0.0, 1.0);

    float dist = length(position);
    vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
  }
`;

const FRAG_SHADER = /* glsl */ `
  varying float vTempNorm;
  varying float vFade;
  uniform float uOpacity;

  vec3 ramp(float t) {
    if (t < 0.33) return mix(vec3(0.15, 0.4, 0.9), vec3(0.05, 0.85, 0.95), t / 0.33);
    if (t < 0.66) return mix(vec3(0.05, 0.85, 0.95), vec3(0.95, 0.55, 0.05), (t - 0.33) / 0.33);
    return mix(vec3(0.95, 0.55, 0.05), vec3(1.0, 0.95, 0.85), (t - 0.66) / 0.34);
  }

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.22) discard;
    if (vFade <= 0.0) discard;
    float alpha = uOpacity * smoothstep(0.22, 0.16, r2) * vFade;
    gl_FragColor = vec4(ramp(vTempNorm), alpha);
  }
`;

export interface GasCloud {
  readonly object: THREE.Points;
  /** Copy positions of *just the gas particles* (gasCount × 4 floats) into geometry. */
  syncPositions(positionsXyzwSlice: Float32Array): void;
  /** Per-particle internal energy (≈ temperature). Length = gasCount. */
  syncTemperatures(uPerParticle: Float32Array): void;
  setTemperatureRange(min: number, max: number): void;
  resize(dpr: number): void;
  dispose(): void;
}

export function createGasCloud(gasCount: number, dpr: number): GasCloud {
  const positions = new Float32Array(gasCount * 3);
  const temps = new Float32Array(gasCount);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aTemp',
    new THREE.BufferAttribute(temps, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    uniforms: {
      uPointSize: { value: 11.0 },
      uMaxScreenSize: { value: 7.0 },
      uPixelRatio: { value: Math.min(dpr, 2) },
      uFadeStart: { value: 0.4 },
      uFadeEnd: { value: 0.55 },
      uTempMin: { value: 1e-3 },
      uTempMax: { value: 1.0 },
      uOpacity: { value: 0.92 },
    },
    transparent: true,
    depthWrite: false,
    // Same NormalBlending switch as particle-cloud.ts — kills the
    // inter-frame additive shimmer that read as flicker.
    blending: THREE.NormalBlending,
  });

  const object = new THREE.Points(geometry, material);

  const syncPositions = (slice: Float32Array): void => {
    const expected = gasCount * 4;
    if (slice.length !== expected) {
      throw new Error(
        `gas-cloud syncPositions: expected ${String(expected)} reals, got ${String(slice.length)}`,
      );
    }
    for (let i = 0; i < gasCount; i += 1) {
      const src = i * 4;
      const dst = i * 3;
      positions[dst] = slice[src] ?? 0;
      positions[dst + 1] = slice[src + 1] ?? 0;
      positions[dst + 2] = slice[src + 2] ?? 0;
    }
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  };

  const syncTemperatures = (u: Float32Array): void => {
    if (u.length !== gasCount) {
      throw new Error(
        `gas-cloud syncTemperatures: expected ${String(gasCount)} reals, got ${String(u.length)}`,
      );
    }
    temps.set(u);
    const attr = geometry.getAttribute('aTemp') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  };

  const setTemperatureRange = (min: number, max: number): void => {
    const uMin = material.uniforms.uTempMin;
    const uMax = material.uniforms.uTempMax;
    if (uMin !== undefined) uMin.value = min;
    if (uMax !== undefined) uMax.value = max;
  };

  const resize = (newDpr: number): void => {
    const u = material.uniforms.uPixelRatio;
    if (u !== undefined) u.value = Math.min(newDpr, 2);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
  };

  return { object, syncPositions, syncTemperatures, setTemperatureRange, resize, dispose };
}
