// Uniform spatial hash grid for fast neighbour queries on the CPU.
// Each cell holds a linked list of particle indices. For density estimation
// we iterate the 27-cell stencil around each particle.
//
// This is the standard linked-list spatial hash; see e.g. Hapala &
// Havran 2011 §2 or the Eric Lengyel game-dev write-ups. We replace the
// CPU grid with a GPU spatial hash in Stage 3.

import type { ParticleSystem } from './particle-system';

export interface SpatialGrid {
  readonly cellSize: number;
  readonly cellsPerSide: number;
  readonly origin: number;
  /** cellHead[cellIdx] = first particle index in that cell, or −1. */
  readonly cellHead: Int32Array;
  /** particleNext[i] = next particle index in i's cell, or −1. */
  readonly particleNext: Int32Array;
}

export interface SpatialGridSpec {
  /** Cell side length. Should be ≥ the largest neighbour-query radius. */
  readonly cellSize: number;
  /** Box half-extent: grid covers [origin, origin + cellsPerSide*cellSize). */
  readonly origin: number;
  /** Number of cells along each axis. */
  readonly cellsPerSide: number;
}

export function createSpatialGrid(ps: ParticleSystem, spec: SpatialGridSpec): SpatialGrid {
  const total = spec.cellsPerSide * spec.cellsPerSide * spec.cellsPerSide;
  return {
    cellSize: spec.cellSize,
    cellsPerSide: spec.cellsPerSide,
    origin: spec.origin,
    cellHead: new Int32Array(total),
    particleNext: new Int32Array(ps.count),
  };
}

export function rebuildSpatialGrid(grid: SpatialGrid, ps: ParticleSystem): void {
  const { cellHead, particleNext, cellSize, cellsPerSide, origin } = grid;
  const max = cellsPerSide - 1;
  cellHead.fill(-1);

  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const x = ps.positions[j] ?? 0;
    const y = ps.positions[j + 1] ?? 0;
    const z = ps.positions[j + 2] ?? 0;

    const cx = clampInt(Math.floor((x - origin) / cellSize), 0, max);
    const cy = clampInt(Math.floor((y - origin) / cellSize), 0, max);
    const cz = clampInt(Math.floor((z - origin) / cellSize), 0, max);
    const cellIdx = (cz * cellsPerSide + cy) * cellsPerSide + cx;

    particleNext[i] = cellHead[cellIdx] ?? -1;
    cellHead[cellIdx] = i;
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export interface DensityKernel {
  readonly radius: number;
  /** W(r) value at distance r. Should integrate to 1 over a sphere of `radius`. */
  weight(r: number): number;
}

// Cubic-spline-like kernel with compact support. Smooth, cheap, peaked at r=0.
//   W(r) = (315 / (64 π h⁹)) · (h² − r²)³,   r < h.
// (Müller, Charypar, Gross 2003 — the "poly6" SPH kernel.)
export function poly6Kernel(radius: number): DensityKernel {
  const h2 = radius * radius;
  const norm = 315 / (64 * Math.PI * Math.pow(radius, 9));
  return {
    radius,
    weight(r: number): number {
      if (r >= radius) return 0;
      const diff = h2 - r * r;
      return norm * diff * diff * diff;
    },
  };
}

/**
 * Compute density for every particle into `densities` (length = ps.count).
 * Uses the grid's 27-cell stencil; complexity is O(N · k) where k is the
 * average neighbour count per particle (small in practice).
 */
export function computeDensities(
  ps: ParticleSystem,
  grid: SpatialGrid,
  kernel: DensityKernel,
  densities: Float32Array,
): void {
  const { cellHead, particleNext, cellSize, cellsPerSide, origin } = grid;
  const max = cellsPerSide - 1;
  const r2max = kernel.radius * kernel.radius;

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
            if (r2 < r2max) {
              rho += (ps.masses[j] ?? 0) * kernel.weight(Math.sqrt(r2));
            }
            j = particleNext[j] ?? -1;
          }
        }
      }
    }
    densities[i] = rho;
  }
}
