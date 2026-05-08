// Star cloud — bright white points marking halos that have crossed the
// Pop III ignition threshold (Stage 4). Selectively bloomed via the
// `BLOOM_LAYER` opt-in so the surrounding DM/gas particles don't drown
// the cosmic web in a single white halo.
//
// Stars are sparse: tens at most, so we allocate a generous buffer and
// disable particles that aren't yet lit by setting their luminosity to 0
// (the shader collapses them to zero size).

import * as THREE from 'three';
import { BLOOM_LAYER } from './scene';

const VERT_SHADER = /* glsl */ `
  attribute float aLuminosity;
  uniform float uPointSize;
  uniform float uPixelRatio;
  varying float vLum;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Distance attenuation × per-star luminosity. lum=0 → invisible.
    gl_PointSize = uPointSize * uPixelRatio * aLuminosity * (1.0 / -mvPosition.z);
    vLum = aLuminosity;
  }
`;

const FRAG_SHADER = /* glsl */ `
  varying float vLum;

  void main() {
    if (vLum <= 0.0) discard;
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    // Star sprite reads as three layered features:
    //   1. A tight Gaussian core — the white-hot ignition point.
    //   2. A 4-rayed cross — the diffraction-spike look every kid
    //      knows from photographs of bright stars. Without rays the
    //      sprite is a generic glowing dot, indistinguishable from
    //      a dense DM clump.
    //   3. A soft outer halo for depth.
    // Bloom on layer 1 then blurs the whole thing into a luminous source.
    float core = exp(-r2 * 22.0);
    float horizontal = exp(-d.y * d.y * 600.0) * smoothstep(0.25, 0.0, r2);
    float vertical = exp(-d.x * d.x * 600.0) * smoothstep(0.25, 0.0, r2);
    float rays = (horizontal + vertical) * 0.45;
    float halo = exp(-r2 * 6.0) * 0.25;
    float intensity = (core + rays + halo) * vLum;
    // Warm-white tone (slightly yellow) so stars don't sit in the same
    // colour bucket as the violet DM cloud.
    vec3 colour = vec3(1.0, 0.94, 0.78);
    gl_FragColor = vec4(colour * intensity, clamp(intensity, 0.0, 1.0));
  }
`;

export interface StarCloud {
  readonly object: THREE.Points;
  /** Update from the runner's star list. Stars beyond capacity are silently dropped. */
  syncStars(stars: readonly { x: number; y: number; z: number; mass: number }[]): void;
  resize(dpr: number): void;
  dispose(): void;
}

export function createStarCloud(maxStars: number, dpr: number): StarCloud {
  const positions = new Float32Array(maxStars * 3);
  const luminosities = new Float32Array(maxStars);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aLuminosity',
    new THREE.BufferAttribute(luminosities, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    uniforms: {
      // Big sprite so the cross-rays have pixels to work with at any
      // sensible camera distance. Selective bloom layer further amplifies.
      uPointSize: { value: 320.0 },
      uPixelRatio: { value: Math.min(dpr, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const object = new THREE.Points(geometry, material);
  // Opt the star cloud into the bloom layer (in addition to layer 0 so the
  // main scene still draws it normally). Selective-bloom material swap in
  // `scene.ts` darkens everything that isn't on this layer.
  object.layers.enable(BLOOM_LAYER);

  const syncStars = (stars: readonly { x: number; y: number; z: number; mass: number }[]): void => {
    const n = Math.min(stars.length, maxStars);
    for (let i = 0; i < n; i += 1) {
      const star = stars[i];
      if (star === undefined) continue;
      const dst = i * 3;
      positions[dst] = star.x;
      positions[dst + 1] = star.y;
      positions[dst + 2] = star.z;
      // Sub-linear scaling so a 100× heavier halo doesn't completely
      // overwhelm tiny ones.
      luminosities[i] = Math.min(2.0, Math.pow(Math.max(star.mass, 1e-9), 0.25));
    }
    // Hide unused slots.
    for (let i = n; i < maxStars; i += 1) {
      luminosities[i] = 0;
    }
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const lumAttr = geometry.getAttribute('aLuminosity') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    lumAttr.needsUpdate = true;
  };

  const resize = (newDpr: number): void => {
    const u = material.uniforms.uPixelRatio;
    if (u !== undefined) u.value = Math.min(newDpr, 2);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
  };

  return { object, syncStars, resize, dispose };
}
