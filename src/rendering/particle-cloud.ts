import * as THREE from 'three';
import type { ParticleSystem } from '@physics/index';

const VERT_SHADER = /* glsl */ `
  uniform float uPointSize;
  uniform float uPixelRatio;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Distance attenuation matched to perspective; multiply by DPR so the
    // physical size on screen is consistent across displays.
    gl_PointSize = uPointSize * uPixelRatio * (1.0 / -mvPosition.z);
  }
`;

const FRAG_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    // Smooth disc with soft falloff toward the edge.
    float alpha = uOpacity * smoothstep(0.25, 0.05, r2);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export interface ParticleCloud {
  readonly object: THREE.Points;
  /** Copy positions out of the SoA buffer into the GPU geometry. */
  syncFrom(ps: ParticleSystem): void;
  resize(dpr: number): void;
  dispose(): void;
}

export function createParticleCloud(count: number, dpr: number): ParticleCloud {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    uniforms: {
      uPointSize: { value: 240.0 },
      uPixelRatio: { value: Math.min(dpr, 2) },
      uColor: { value: new THREE.Color('#9b7fe8') },
      uOpacity: { value: 0.85 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const object = new THREE.Points(geometry, material);

  const syncFrom = (ps: ParticleSystem): void => {
    if (ps.count !== count) {
      throw new Error(
        `particle count mismatch: cloud expects ${String(count)}, got ${String(ps.count)}`,
      );
    }
    // Source is xyz_ packed (4-stride); destination is xyz packed.
    for (let i = 0; i < count; i += 1) {
      const src = i * 4;
      const dst = i * 3;
      positions[dst] = ps.positions[src] ?? 0;
      positions[dst + 1] = ps.positions[src + 1] ?? 0;
      positions[dst + 2] = ps.positions[src + 2] ?? 0;
    }
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  };

  const resize = (newDpr: number): void => {
    const u = material.uniforms.uPixelRatio;
    if (u !== undefined) u.value = Math.min(newDpr, 2);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
  };

  return { object, syncFrom, resize, dispose };
}
