// SPH density estimator. For each particle i:
//
//   ρ_i = Σ_j m_j · W(|r_ij|, h)
//
// The sum runs over all neighbours within the kernel's support radius
// (`2h` for the cubic-spline kernel). Self-contribution `j = i` is
// included — at r = 0 the kernel gives its peak value σ₃, so that term
// is `m_i · W(0, h)` per particle.
//
// We reuse the Stage-1b spatial hash grid (`spatial-grid.ts`) — the cell
// size is set by the caller to ≥ kernel.support so the 27-cell stencil
// covers all relevant neighbours.

import type { ParticleSystem } from './particle-system';
import type { SphKernel } from './sph-kernels';
import type { SpatialGrid } from './spatial-grid';

export function computeSphDensity(
  ps: ParticleSystem,
  grid: SpatialGrid,
  kernel: SphKernel,
  densitiesOut: Float32Array,
): void {
  const { cellHead, particleNext, cellSize, cellsPerSide, origin } = grid;
  const max = cellsPerSide - 1;
  const support = kernel.support;
  const support2 = support * support;

  if (densitiesOut.length !== ps.count) {
    throw new RangeError(
      `computeSphDensity: densitiesOut length ${String(densitiesOut.length)} != ps.count ${String(ps.count)}`,
    );
  }

  for (let i = 0; i < ps.count; i += 1) {
    const ii = i * 4;
    const xi = ps.positions[ii] ?? 0;
    const yi = ps.positions[ii + 1] ?? 0;
    const zi = ps.positions[ii + 2] ?? 0;

    const cx = clampInt(Math.floor((xi - origin) / cellSize), 0, max);
    const cy = clampInt(Math.floor((yi - origin) / cellSize), 0, max);
    const cz = clampInt(Math.floor((zi - origin) / cellSize), 0, max);

    const x0 = Math.max(0, cx - 1);
    const x1 = Math.min(max, cx + 1);
    const y0 = Math.max(0, cy - 1);
    const y1 = Math.min(max, cy + 1);
    const z0 = Math.max(0, cz - 1);
    const z1 = Math.min(max, cz + 1);

    let rho = 0;
    for (let zz = z0; zz <= z1; zz += 1) {
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          const cellIdx = (zz * cellsPerSide + yy) * cellsPerSide + xx;
          let j = cellHead[cellIdx] ?? -1;
          while (j !== -1) {
            const jj = j * 4;
            const dx = (ps.positions[jj] ?? 0) - xi;
            const dy = (ps.positions[jj + 1] ?? 0) - yi;
            const dz = (ps.positions[jj + 2] ?? 0) - zi;
            const r2 = dx * dx + dy * dy + dz * dz;
            if (r2 < support2) {
              rho += (ps.masses[j] ?? 0) * kernel.weight(Math.sqrt(r2));
            }
            j = particleNext[j] ?? -1;
          }
        }
      }
    }
    densitiesOut[i] = rho;
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
