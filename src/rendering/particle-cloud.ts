import * as THREE from 'three';

const VERT_SHADER = /* glsl */ `
  attribute float aDensity;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uMaxScreenSize;
  uniform float uDensityMin;
  uniform float uDensityMax;
  varying float vDensityNorm;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Perspective scaling × DPR, but clamped at a hard upper bound. Without
    // the clamp, particles near the camera blow up to 100s of pixels and
    // read as out-of-focus bokeh blobs instead of discrete particles.
    float perspective = uPointSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_PointSize = min(perspective, uMaxScreenSize * uPixelRatio);

    // Log scaling makes the central peak readable without crushing the wings.
    float lo = log(max(uDensityMin, 1e-6));
    float hi = log(max(uDensityMax, uDensityMin * 1.000001));
    float v = (log(max(aDensity, 1e-6)) - lo) / max(hi - lo, 1e-6);
    vDensityNorm = clamp(v, 0.0, 1.0);
  }
`;

const FRAG_SHADER = /* glsl */ `
  uniform vec3 uColorLo;
  uniform vec3 uColorMid;
  uniform vec3 uColorHi;
  uniform float uOpacity;
  varying float vDensityNorm;

  vec3 ramp(float t) {
    if (t < 0.5) return mix(uColorLo, uColorMid, t * 2.0);
    return mix(uColorMid, uColorHi, (t - 0.5) * 2.0);
  }

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.22) discard;
    // Sharper edge than the previous smoothstep(0.25, 0.05) bokeh: most
    // of the sprite is opaque, with a tight 1-pixel-or-so anti-alias
    // ring at the boundary. Reads as discrete particles, not blurry orbs.
    float alpha = uOpacity * smoothstep(0.22, 0.16, r2);
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
      // Small sprite ≈ 22 px / -mvPosition.z. At the new camera distance
      // (~2.6 from origin), DM particles read as discrete dots rather
      // than overlapping bokeh blobs.
      uPointSize: { value: 22.0 },
      // Hard cap on screen-space sprite size so particles closer to the
      // camera don't dominate the frame as fuzzy bokeh.
      uMaxScreenSize: { value: 14.0 },
      uPixelRatio: { value: Math.min(dpr, 2) },
      uColorLo: { value: new THREE.Color('#2a1b3d') },
      uColorMid: { value: new THREE.Color('#5b3f8e') },
      uColorHi: { value: new THREE.Color('#9b7fe8') },
      uDensityMin: { value: 1e-3 },
      uDensityMax: { value: 1.0 },
      // Low per-sprite alpha so halo cores don't saturate to white
      // through additive stacking alone. Density gradient still reads
      // because the colour ramp + alpha → opaque-violet at peak density.
      uOpacity: { value: 0.32 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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
