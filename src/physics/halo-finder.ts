// Friends-of-friends (FoF) halo finder.
//
// Two particles belong to the same halo if their separation is below the
// linking length b · ⟨l⟩, where ⟨l⟩ is the mean inter-particle separation
// in the box. Davis et al. (1985) and every cosmological structure-finding
// pipeline since use b = 0.2 by default — that catches over-densities at
// the virial threshold ρ ≈ 200 ρ̄.
//
// Algorithm:
//   1. Build / reuse a spatial-hash grid with cellSize ≥ linkingLength so
//      each particle only inspects 27 neighbouring cells.
//   2. Union-find pass: for each particle, link it to every neighbour
//      within the linking length.
//   3. Group pass: collect each connected component; per group compute
//      mass, mass-weighted centre, R_vir, v_circ.
//
// Implementation notes:
//   * Min-image distances when `periodicBoxSize > 0` so haloes spanning a
//     box face are still captured.
//   * Halos with fewer than `minMembers` particles are discarded — finite-N
//     noise produces spurious 2-3-particle "linked pairs" otherwise.
//   * R_vir uses the spherical-overdensity Δ = 200: M / V_vir = 200 · ρ̄.
//   * v_circ = √(G M / R_vir) — order-of-magnitude only in code units.

import { GRAVITATIONAL_CONSTANT } from './constants';
import type { ParticleSystem } from './particle-system';
import { rebuildSpatialGrid, type SpatialGrid } from './spatial-grid';

export interface Halo {
  /** Mass-weighted centre of the halo. */
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  /** Total mass of the linked particles. */
  readonly mass: number;
  /** Number of particles in the halo. */
  readonly memberCount: number;
  /** Virial radius, R_vir = (3 M / (4π Δ ρ̄))^(1/3) with Δ = 200. */
  readonly rVir: number;
  /** Circular velocity v_circ = √(G M / R_vir). */
  readonly vCirc: number;
}

export interface FoFOptions {
  /** Operate on particles in [start, start + count). Use this to skip gas/star species. */
  readonly start: number;
  readonly count: number;
  /** b · ⟨l⟩ — typically b = 0.2 × mean inter-particle separation. */
  readonly linkingLength: number;
  /** If > 0, use periodic min-image distances inside a cubic box of this side length. */
  readonly periodicBoxSize: number;
  /** Halos with fewer members than this are discarded. Default 8. */
  readonly minMembers?: number;
  /** Mean background density for R_vir computation. Default = totalMass / boxVolume. */
  readonly rhoBar?: number;
  /** Newton's G in code units. */
  readonly G?: number;
}

/**
 * Run FoF over the slice [start, start + count). Returns one Halo per
 * connected component with at least `minMembers` particles, sorted by mass
 * descending.
 */
export function findHalos(ps: ParticleSystem, grid: SpatialGrid, opts: FoFOptions): Halo[] {
  // Rebuild the grid from current positions — cheaper than asking the caller
  // to remember whether they did so this step.
  rebuildSpatialGrid(grid, ps);

  const { start, count, linkingLength, periodicBoxSize } = opts;
  const minMembers = opts.minMembers ?? 8;
  const G = opts.G ?? GRAVITATIONAL_CONSTANT;
  const halfL = 0.5 * periodicBoxSize;
  const periodic = periodicBoxSize > 0;
  const link2 = linkingLength * linkingLength;

  // Union-find. parent[i] is the root index for particle (start + i).
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i += 1) parent[i] = i;

  const find = (i: number): number => {
    let cur = i;
    while ((parent[cur] ?? cur) !== cur) {
      const next = parent[cur] ?? cur;
      const root = parent[next] ?? next;
      parent[cur] = root; // path compression
      cur = root;
    }
    return cur;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Walk the grid and link every pair within linkingLength.
  const { cellHead, particleNext, cellSize, cellsPerSide, origin } = grid;
  const max = cellsPerSide - 1;
  const end = start + count;
  // Wrap a stencil offset into [0, cellsPerSide) when periodic, otherwise
  // clamp to [0, cellsPerSide−1]. Returning −1 signals "skip this cell".
  const stencilCell = (c: number): number => {
    if (periodic) {
      let cc = c;
      if (cc < 0) cc += cellsPerSide;
      else if (cc >= cellsPerSide) cc -= cellsPerSide;
      return cc;
    }
    if (c < 0 || c > max) return -1;
    return c;
  };

  for (let g = 0; g < count; g += 1) {
    const i = start + g;
    const ii = i * 4;
    const xi = ps.positions[ii] ?? 0;
    const yi = ps.positions[ii + 1] ?? 0;
    const zi = ps.positions[ii + 2] ?? 0;

    const cx = clampInt(Math.floor((xi - origin) / cellSize), 0, max);
    const cy = clampInt(Math.floor((yi - origin) / cellSize), 0, max);
    const cz = clampInt(Math.floor((zi - origin) / cellSize), 0, max);

    for (let dz = -1; dz <= 1; dz += 1) {
      const zz = stencilCell(cz + dz);
      if (zz < 0) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = stencilCell(cy + dy);
        if (yy < 0) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = stencilCell(cx + dx);
          if (xx < 0) continue;
          const cellIdx = (zz * cellsPerSide + yy) * cellsPerSide + xx;
          let j = cellHead[cellIdx] ?? -1;
          while (j !== -1) {
            if (j !== i && j >= start && j < end) {
              const jj = j * 4;
              let dx = (ps.positions[jj] ?? 0) - xi;
              let dy = (ps.positions[jj + 1] ?? 0) - yi;
              let dz = (ps.positions[jj + 2] ?? 0) - zi;
              if (periodic) {
                if (dx > halfL) dx -= periodicBoxSize;
                else if (dx < -halfL) dx += periodicBoxSize;
                if (dy > halfL) dy -= periodicBoxSize;
                else if (dy < -halfL) dy += periodicBoxSize;
                if (dz > halfL) dz -= periodicBoxSize;
                else if (dz < -halfL) dz += periodicBoxSize;
              }
              const r2 = dx * dx + dy * dy + dz * dz;
              if (r2 < link2) {
                union(g, j - start);
              }
            }
            j = particleNext[j] ?? -1;
          }
        }
      }
    }
  }

  // Group particles by root and accumulate aggregates.
  const groupMap = new Map<
    number,
    {
      mass: number;
      cx: number;
      cy: number;
      cz: number;
      count: number;
      refX: number;
      refY: number;
      refZ: number;
    }
  >();
  for (let g = 0; g < count; g += 1) {
    const root = find(g);
    const i = start + g;
    const ii = i * 4;
    const m = ps.masses[i] ?? 0;
    const x = ps.positions[ii] ?? 0;
    const y = ps.positions[ii + 1] ?? 0;
    const z = ps.positions[ii + 2] ?? 0;
    let group = groupMap.get(root);
    if (group === undefined) {
      group = { mass: 0, cx: 0, cy: 0, cz: 0, count: 0, refX: x, refY: y, refZ: z };
      groupMap.set(root, group);
    }
    // Periodic mass-weighted centre: keep accumulating relative to a fixed
    // reference particle (the first one in the group), unwrapping via
    // min-image. Otherwise a halo straddling a box edge averages to the
    // wrong centre.
    let dx = x - group.refX;
    let dy = y - group.refY;
    let dz = z - group.refZ;
    if (periodic) {
      if (dx > halfL) dx -= periodicBoxSize;
      else if (dx < -halfL) dx += periodicBoxSize;
      if (dy > halfL) dy -= periodicBoxSize;
      else if (dy < -halfL) dy += periodicBoxSize;
      if (dz > halfL) dz -= periodicBoxSize;
      else if (dz < -halfL) dz += periodicBoxSize;
    }
    group.cx += m * (group.refX + dx);
    group.cy += m * (group.refY + dy);
    group.cz += m * (group.refZ + dz);
    group.mass += m;
    group.count += 1;
  }

  const rhoBar =
    opts.rhoBar ??
    (periodicBoxSize > 0
      ? totalMassInRange(ps, start, count) / (periodicBoxSize * periodicBoxSize * periodicBoxSize)
      : 1);

  const halos: Halo[] = [];
  for (const group of groupMap.values()) {
    if (group.count < minMembers) continue;
    const cx = group.cx / group.mass;
    const cy = group.cy / group.mass;
    const cz = group.cz / group.mass;
    // R_vir from spherical-overdensity Δ = 200.
    const rVir = Math.cbrt((3 * group.mass) / (4 * Math.PI * 200 * rhoBar));
    const vCirc = Math.sqrt((G * group.mass) / Math.max(rVir, 1e-9));
    halos.push({
      cx,
      cy,
      cz,
      mass: group.mass,
      memberCount: group.count,
      rVir,
      vCirc,
    });
  }

  halos.sort((a, b) => b.mass - a.mass);
  return halos;
}

function totalMassInRange(ps: ParticleSystem, start: number, count: number): number {
  let m = 0;
  for (let i = 0; i < count; i += 1) m += ps.masses[start + i] ?? 0;
  return m;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
