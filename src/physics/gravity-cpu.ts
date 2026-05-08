// Direct N² gravity on the CPU. Reference implementation per
// `stages/DECISIONS.md` (2026-05-08 — Two-track gravity …).
//
// a_i = Σ_{j ≠ i} G m_j (r_j − r_i) / (|r_ji|² + ε²)^(3/2)
//
// Plummer softening — Aarseth (1963), see also Springel 2005 §2.1. The
// softening length ε is a parameter, never a magic number (RULES §6).
//
// Stage 2c2 adds an optional `periodicBoxSize`: when set, pairwise
// distances use the minimum-image convention so a particle near one face
// of the box also feels the gravity of particles near the opposite face
// (their wrapped images). For an infinite homogeneous distribution the
// resulting net force is zero by symmetry, which is what we need for a
// cosmologically self-consistent simulation. We don't do an Ewald sum;
// the truncation at L/2 produces small edge artifacts which are
// acceptable for this visual-only educational tool.

import { GRAVITATIONAL_CONSTANT } from './constants';
import type { ParticleSystem } from './particle-system';

export interface GravityOptions {
  readonly softening: number;
  readonly G?: number;
  /** If set, use min-image distances inside a periodic box of this side length. */
  readonly periodicBoxSize?: number;
}

function minImage(d: number, halfL: number, L: number): number {
  if (d > halfL) return d - L;
  if (d < -halfL) return d + L;
  return d;
}

export function computeAccelerations(ps: ParticleSystem, opts: GravityOptions): void {
  const { positions, masses, accelerations, count } = ps;
  const eps2 = opts.softening * opts.softening;
  const G = opts.G ?? GRAVITATIONAL_CONSTANT;
  const L = opts.periodicBoxSize ?? 0;
  const halfL = 0.5 * L;
  const periodic = L > 0;

  accelerations.fill(0);

  for (let i = 0; i < count; i += 1) {
    const ix = i * 4;
    const xi = positions[ix] ?? 0;
    const yi = positions[ix + 1] ?? 0;
    const zi = positions[ix + 2] ?? 0;
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (let j = 0; j < count; j += 1) {
      if (j === i) continue;
      const jx = j * 4;
      let dx = (positions[jx] ?? 0) - xi;
      let dy = (positions[jx + 1] ?? 0) - yi;
      let dz = (positions[jx + 2] ?? 0) - zi;
      if (periodic) {
        dx = minImage(dx, halfL, L);
        dy = minImage(dy, halfL, L);
        dz = minImage(dz, halfL, L);
      }
      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      const m = masses[j] ?? 0;
      const f = G * m * invR3;
      ax += f * dx;
      ay += f * dy;
      az += f * dz;
    }
    accelerations[ix] = ax;
    accelerations[ix + 1] = ay;
    accelerations[ix + 2] = az;
  }
}

// Gravitational potential energy with the same softening law:
// U = − Σ_{i<j} G m_i m_j / √(|r_ji|² + ε²)
export function potentialEnergy(ps: ParticleSystem, opts: GravityOptions): number {
  const { positions, masses, count } = ps;
  const eps2 = opts.softening * opts.softening;
  const G = opts.G ?? GRAVITATIONAL_CONSTANT;
  let U = 0;
  for (let i = 0; i < count; i += 1) {
    const ix = i * 4;
    const xi = positions[ix] ?? 0;
    const yi = positions[ix + 1] ?? 0;
    const zi = positions[ix + 2] ?? 0;
    const mi = masses[i] ?? 0;
    for (let j = i + 1; j < count; j += 1) {
      const jx = j * 4;
      const dx = (positions[jx] ?? 0) - xi;
      const dy = (positions[jx + 1] ?? 0) - yi;
      const dz = (positions[jx + 2] ?? 0) - zi;
      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      U -= (G * mi * (masses[j] ?? 0)) / Math.sqrt(r2);
    }
  }
  return U;
}

export function kineticEnergy(ps: ParticleSystem): number {
  const { velocities, masses, count } = ps;
  let T = 0;
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    const vx = velocities[j] ?? 0;
    const vy = velocities[j + 1] ?? 0;
    const vz = velocities[j + 2] ?? 0;
    const m = masses[i] ?? 0;
    T += 0.5 * m * (vx * vx + vy * vy + vz * vz);
  }
  return T;
}
