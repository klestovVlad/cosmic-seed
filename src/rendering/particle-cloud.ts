import * as THREE from 'three';

const VERT_SHADER = /* glsl */ `
  attribute float aDensity;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uMaxScreenSize;
  uniform float uDensityMin;
  uniform float uDensityMax;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  varying float vDensityNorm;
  varying float vFade;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float perspective = uPointSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_PointSize = min(perspective, uMaxScreenSize * uPixelRatio);

    float lo = log(max(uDensityMin, 1e-6));
    float hi = log(max(uDensityMax, uDensityMin * 1.000001));
    float v = (log(max(aDensity, 1e-6)) - lo) / max(hi - lo, 1e-6);
    vDensityNorm = clamp(v, 0.0, 1.0);

    // Distance-based fade from the unwrap origin (scene origin, since the
    // renderer pre-translates particles around it). Past uFadeStart the
    // alpha tapers; past uFadeEnd it's zero. Kills the hard "edge of the
    // periodic-image cluster" the user saw — cosmic web ends in soft
    // darkness, not a perceptible boundary.
    float dist = length(position);
    vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
  }
`;

const FRAG_SHADER = /* glsl */ `
  uniform vec3 uColorLo;
  uniform vec3 uColorMid;
  uniform vec3 uColorHi;
  uniform float uOpacity;
  varying float vDensityNorm;
  varying float vFade;

  vec3 ramp(float t) {
    if (t < 0.5) return mix(uColorLo, uColorMid, t * 2.0);
    return mix(uColorMid, uColorHi, (t - 0.5) * 2.0);
  }

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.22) discard;
    if (vFade <= 0.0) discard;
    float alpha = uOpacity * smoothstep(0.22, 0.16, r2) * vFade;
    vec3 color = ramp(vDensityNorm);
    color += vec3(0.15) * pow(vDensityNorm, 4.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface ParticleCloud {
  readonly object: THREE.Points;
  /** Copy positions from a `count × 4` (xyz + pad) typed array into the GPU geometry. */
  syncPositions(positionsXyzw: Float32Array): void;
  /** Copy per-particle densities into the GPU attribute. */
  syncDensities(densities: Float32Array): void;
  setDensityRange(min: number, max: number): void;
  resize(dpr: number): void;
  dispose(): void;
}

export function createParticleCloud(count: number, dpr: number): ParticleCloud {
  const positions = new Float32Array(count * 3);
  const densities = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aDensity',
    new THREE.BufferAttribute(densities, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    uniforms: {
      // Tiny sprites: max 7 px on retina (× 2 = 14 px screen). Small
      // enough that the cosmic-web sampling reads as a particle field,
      // not a sea of overlapping discs.
      uPointSize: { value: 11.0 },
      uMaxScreenSize: { value: 7.0 },
      uPixelRatio: { value: Math.min(dpr, 2) },
      uColorLo: { value: new THREE.Color('#2a1b3d') },
      uColorMid: { value: new THREE.Color('#7a5cb8') },
      uColorHi: { value: new THREE.Color('#cdb8ff') },
      uDensityMin: { value: 1e-3 },
      uDensityMax: { value: 1.0 },
      uOpacity: { value: 0.92 },
      // Distance fade — particles past uFadeStart taper to nothing by
      // uFadeEnd. With box half-extent 0.5 and unwrap at scene origin,
      // 0.4 → 0.55 gives a soft halo of the cluster fading to dark
      // space. No visible boundary.
      uFadeStart: { value: 0.4 },
      uFadeEnd: { value: 0.55 },
    },
    transparent: true,
    depthWrite: false,
    // NormalBlending (vs the previous AdditiveBlending) is the structural
    // fix for "everything mельтешит": additive blending sums every
    // overlapping particle per-pixel, so the SAME pixel shows different
    // brightness frame-to-frame as particles drift sub-pixel — exactly
    // the visual shimmer the user reported. Normal blending paints each
    // pixel with the front-most particle: stable across frames, density
    // gradient encoded by colour (deep violet → light violet) instead of
    // luminance accumulation.
    blending: THREE.NormalBlending,
  });

  const object = new THREE.Points(geometry, material);

  const syncPositions = (positionsXyzw: Float32Array): void => {
    const expected = count * 4;
    if (positionsXyzw.length !== expected) {
      throw new Error(
        `particle position buffer length mismatch: expected ${String(expected)}, got ${String(positionsXyzw.length)}`,
      );
    }
    for (let i = 0; i < count; i += 1) {
      const src = i * 4;
      const dst = i * 3;
      positions[dst] = positionsXyzw[src] ?? 0;
      positions[dst + 1] = positionsXyzw[src + 1] ?? 0;
      positions[dst + 2] = positionsXyzw[src + 2] ?? 0;
    }
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  };

  const syncDensities = (rho: Float32Array): void => {
    densities.set(rho);
    const attr = geometry.getAttribute('aDensity') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  };

  const setDensityRange = (min: number, max: number): void => {
    const uMin = material.uniforms.uDensityMin;
    const uMax = material.uniforms.uDensityMax;
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

  return { object, syncPositions, syncDensities, setDensityRange, resize, dispose };
}
