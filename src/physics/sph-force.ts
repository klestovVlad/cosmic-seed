// Symmetrised SPH pressure-gradient force + adiabatic energy update.
// Stage 3b — no artificial viscosity yet; that lands in 3c alongside the
// GPU port. Without viscosity the gas can't shock-heat at virial radii,
// but pressure support already keeps cores from collapsing to a point
// and adiabatic compression in halo cores does heat them visibly.
//
// Per-particle equations (Monaghan 1992, Springel 2010):
//
//   a_i = − Σ_j m_j [ P_i / ρ_i² + P_j / ρ_j² ] · ∇_i W_ij
//
//   du_i/dt = (P_i / ρ_i²) · Σ_j m_j (v_i − v_j) · ∇_i W_ij
//
// where ∇_i W_ij = − dW/dr · (r_j − r_i) / r_ij. Note the negative sign:
// ∇_i is the gradient with respect to particle i's position, but the
// kernel is W(|r_j − r_i|), so derivative with respect to r_i is the
// negative of derivative with respect to (r_j − r_i).
//
// The function operates on a slice of a `ParticleSystem` whose gas
// particles live at indices [gasStart, gasStart + gasCount). Density and
// internal energy live in gas-local arrays of length gasCount.

import type { ParticleSystem } from './particle-system';
import type { SphKernel } from './sph-kernels';
import type { SpatialGrid } from './spatial-grid';

export interface SphForceOutputs {
  /** count × 4 (xyz + pad). Pressure-gradient acceleration on each gas particle. */
  readonly accelerations: Float32Array;
  /** count. du/dt for each gas particle (adiabatic compression heating). */
  readonly dudt: Float32Array;
}

export interface SphForceOptions {
  /** Particle index of the first gas particle in `ps`. */
  readonly gasStart: number;
  /** Number of gas particles. */
  readonly gasCount: number;
  /** Adiabatic index γ. 5/3 for monatomic ideal gas. */
  readonly gamma: number;
  /** Internal energies, length = gasCount. */
  readonly internalEnergy: Float32Array;
  /** SPH densities for gas particles, length = gasCount. */
  readonly densities: Float32Array;
}

export function computeSphForcesAndEnergy(
  ps: ParticleSystem,
  grid: SpatialGrid,
  kernel: SphKernel,
  opts: SphForceOptions,
  out: SphForceOutputs,
): void {
  const { gasStart, gasCount, gamma, internalEnergy, densities } = opts;
  const { positions, velocities, masses } = ps;
  const { cellHead, particleNext, cellSize, cellsPerSide, origin } = grid;
  const max = cellsPerSide - 1;
  const support = kernel.support;
  const support2 = support * support;
  const gammaMinus1 = gamma - 1;

  if (out.accelerations.length !== gasCount * 4) {
    throw new RangeError(
      `sph accelerations length ${String(out.accelerations.length)} != ${String(gasCount * 4)}`,
    );
  }
  if (out.dudt.length !== gasCount) {
    throw new RangeError(`sph dudt length ${String(out.dudt.length)} != ${String(gasCount)}`);
  }

  // Pre-compute pressure / ρ² per gas particle.
  const pOverRho2 = new Float32Array(gasCount);
  for (let g = 0; g < gasCount; g += 1) {
    const rho = densities[g] ?? 0;
    if (rho > 0) {
      const u = internalEnergy[g] ?? 0;
      const P = gammaMinus1 * rho * u;
      pOverRho2[g] = P / (rho * rho);
    }
  }

  out.accelerations.fill(0);
  out.dudt.fill(0);

  for (let g = 0; g < gasCount; g += 1) {
    const i = gasStart + g;
    const ii = i * 4;
    const xi = positions[ii] ?? 0;
    const yi = positions[ii + 1] ?? 0;
    const zi = positions[ii + 2] ?? 0;
    const vxi = velocities[ii] ?? 0;
    const vyi = velocities[ii + 1] ?? 0;
    const vzi = velocities[ii + 2] ?? 0;
    const piRho2 = pOverRho2[g] ?? 0;

    const cx = clampInt(Math.floor((xi - origin) / cellSize), 0, max);
    const cy = clampInt(Math.floor((yi - origin) / cellSize), 0, max);
    const cz = clampInt(Math.floor((zi - origin) / cellSize), 0, max);

    const x0 = Math.max(0, cx - 1);
    const x1 = Math.min(max, cx + 1);
    const y0 = Math.max(0, cy - 1);
    const y1 = Math.min(max, cy + 1);
    const z0 = Math.max(0, cz - 1);
    const z1 = Math.min(max, cz + 1);

    let ax = 0;
    let ay = 0;
    let az = 0;
    let dudt = 0;

    for (let zz = z0; zz <= z1; zz += 1) {
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          const cellIdx = (zz * cellsPerSide + yy) * cellsPerSide + xx;
          let j = cellHead[cellIdx] ?? -1;
          while (j !== -1) {
            // Skip non-gas neighbours and self.
            if (j !== i && j >= gasStart && j < gasStart + gasCount) {
              const jj = j * 4;
              const dx = (positions[jj] ?? 0) - xi;
              const dy = (positions[jj + 1] ?? 0) - yi;
              const dz = (positions[jj + 2] ?? 0) - zi;
              const r2 = dx * dx + dy * dy + dz * dz;
              if (r2 < support2 && r2 > 0) {
                const r = Math.sqrt(r2);
                const dW = kernel.gradient(r); // scalar dW/dr (negative for r > 0)
                const invR = 1 / r;
                // Vector ∇_i W = − dW/dr · (r_j − r_i) / r_ij
                const gradX = -dW * dx * invR;
                const gradY = -dW * dy * invR;
                const gradZ = -dW * dz * invR;
                const gOther = j - gasStart;
                const pjRho2 = pOverRho2[gOther] ?? 0;
                const factor = (masses[j] ?? 0) * (piRho2 + pjRho2);
                ax -= factor * gradX;
                ay -= factor * gradY;
                az -= factor * gradZ;
                // Energy: (P_i / ρ_i²) · m_j (v_i − v_j) · ∇_i W
                const dvx = vxi - (velocities[jj] ?? 0);
                const dvy = vyi - (velocities[jj + 1] ?? 0);
                const dvz = vzi - (velocities[jj + 2] ?? 0);
                dudt += piRho2 * (masses[j] ?? 0) * (dvx * gradX + dvy * gradY + dvz * gradZ);
              }
            }
            j = particleNext[j] ?? -1;
          }
        }
      }
    }

    const oi = g * 4;
    out.accelerations[oi] = ax;
    out.accelerations[oi + 1] = ay;
    out.accelerations[oi + 2] = az;
    out.dudt[g] = dudt;
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
