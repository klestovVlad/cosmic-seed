// Aggregate scalars used by the HUD and the conservation tests.

import { kineticEnergy, potentialEnergy, type GravityOptions } from './gravity-cpu';
import { totalMomentum, type ParticleSystem } from './particle-system';

export interface EnergyReport {
  readonly kinetic: number;
  readonly potential: number;
  readonly total: number;
  /** −T / U; equals 0.5 in virial equilibrium. */
  readonly virialRatio: number;
}

export function energyReport(ps: ParticleSystem, opts: GravityOptions): EnergyReport {
  const T = kineticEnergy(ps);
  const U = potentialEnergy(ps, opts);
  const virialRatio = U === 0 ? 0 : -T / U;
  return { kinetic: T, potential: U, total: T + U, virialRatio };
}

export interface MomentumReport {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly magnitude: number;
}

const _scratch = new Float32Array(3);

export function momentumReport(ps: ParticleSystem): MomentumReport {
  totalMomentum(ps, _scratch);
  const x = _scratch[0] ?? 0;
  const y = _scratch[1] ?? 0;
  const z = _scratch[2] ?? 0;
  return { x, y, z, magnitude: Math.sqrt(x * x + y * y + z * z) };
}

/**
 * Cheap density estimate at the centre of the box: count particles within `radius`,
 * divided by the sphere's volume. Good enough for the HUD; replaced by a real
 * SPH-style estimate in Stage 3.
 */
export function centralDensity(ps: ParticleSystem, radius: number): number {
  const r2 = radius * radius;
  let mass = 0;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const x = ps.positions[j] ?? 0;
    const y = ps.positions[j + 1] ?? 0;
    const z = ps.positions[j + 2] ?? 0;
    if (x * x + y * y + z * z < r2) {
      mass += ps.masses[i] ?? 0;
    }
  }
  const volume = (4 / 3) * Math.PI * radius * radius * radius;
  return mass / volume;
}
