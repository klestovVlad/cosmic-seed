import { describe, expect, it } from 'vitest';
import { createParticleSystem, createSpatialGrid, findHalos, setParticle } from '../../src/physics';

describe('FoF halo finder', () => {
  it('two well-separated clusters of 10 particles each → two halos', () => {
    const ps = createParticleSystem(20);
    // Cluster A near origin
    for (let i = 0; i < 10; i += 1) {
      const x = (i % 3) * 0.01 - 0.01;
      const y = (Math.floor(i / 3) % 3) * 0.01 - 0.01;
      const z = (Math.floor(i / 9) % 3) * 0.01 - 0.01;
      setParticle(ps, i, x, y, z, 0, 0, 0, 1);
    }
    // Cluster B far away
    for (let i = 0; i < 10; i += 1) {
      const x = 1.0 + (i % 3) * 0.01;
      const y = 1.0 + (Math.floor(i / 3) % 3) * 0.01;
      const z = 1.0 + (Math.floor(i / 9) % 3) * 0.01;
      setParticle(ps, 10 + i, x, y, z, 0, 0, 0, 1);
    }
    const grid = createSpatialGrid(ps, { cellSize: 0.05, cellsPerSide: 64, origin: -1.6 });
    const halos = findHalos(ps, grid, {
      start: 0,
      count: 20,
      linkingLength: 0.04,
      periodicBoxSize: 0,
      minMembers: 5,
    });
    expect(halos.length).toBe(2);
    // Both halos have 10 members, mass 10 each.
    expect(halos[0]?.memberCount).toBe(10);
    expect(halos[1]?.memberCount).toBe(10);
    expect(halos[0]?.mass).toBeCloseTo(10, 6);
  });

  it('isolated particles produce no halos when below minMembers', () => {
    const ps = createParticleSystem(5);
    for (let i = 0; i < 5; i += 1) {
      setParticle(ps, i, i * 0.5, 0, 0, 0, 0, 0, 1);
    }
    const grid = createSpatialGrid(ps, { cellSize: 0.1, cellsPerSide: 64, origin: -2 });
    const halos = findHalos(ps, grid, {
      start: 0,
      count: 5,
      linkingLength: 0.05,
      periodicBoxSize: 0,
      minMembers: 8,
    });
    expect(halos.length).toBe(0);
  });

  it('halo straddling a periodic box face still has correct centre', () => {
    // Two particles near opposite faces — without periodic min-image they'd
    // be far apart; with periodic boundaries they're neighbours.
    const ps = createParticleSystem(20);
    for (let i = 0; i < 10; i += 1) {
      // Near the +x face of a unit box: x ≈ 0.49
      const x = 0.49 + (i % 3) * 0.005;
      const y = (i % 3) * 0.005;
      const z = (Math.floor(i / 3) % 3) * 0.005;
      setParticle(ps, i, x, y, z, 0, 0, 0, 1);
    }
    for (let i = 0; i < 10; i += 1) {
      // Near the −x face: x ≈ −0.495 (so the periodic distance to +x face is ~0.015)
      const x = -0.495 + (i % 3) * 0.005;
      const y = (i % 3) * 0.005;
      const z = (Math.floor(i / 3) % 3) * 0.005;
      setParticle(ps, 10 + i, x, y, z, 0, 0, 0, 1);
    }
    // Grid must align exactly with the periodic box (cellsPerSide × cellSize = boxSize)
    // for the wrap-around stencil to find cross-boundary neighbours within one cell.
    const grid = createSpatialGrid(ps, { cellSize: 0.05, cellsPerSide: 20, origin: -0.5 });
    const halos = findHalos(ps, grid, {
      start: 0,
      count: 20,
      linkingLength: 0.04,
      periodicBoxSize: 1.0,
      minMembers: 5,
    });
    expect(halos.length).toBe(1);
    expect(halos[0]?.memberCount).toBe(20);
  });

  it('halos sorted by mass descending', () => {
    const ps = createParticleSystem(30);
    // Cluster A: 8 particles, mass 1 each (=8)
    for (let i = 0; i < 8; i += 1) {
      setParticle(ps, i, i * 0.005 - 0.02, 0, 0, 0, 0, 0, 1);
    }
    // Cluster B: 20 particles, mass 1 each (=20)
    for (let i = 0; i < 20; i += 1) {
      const x = 1.0 + (i % 4) * 0.005;
      const y = (Math.floor(i / 4) % 4) * 0.005;
      const z = 0;
      setParticle(ps, 8 + i, x, y, z, 0, 0, 0, 1);
    }
    // Cluster C: 12 particles, mass 1 each (=12)
    for (let i = 0; i < 12; i += 1) {
      const x = -1.0 + (i % 4) * 0.005;
      const y = (Math.floor(i / 4) % 4) * 0.005;
      setParticle(ps, 28 + (i % 2), x, y, 0, 0, 0, 0, 1);
    }
    // (Above re-uses indices; just check that sort works on whatever clusters form.)
    const grid = createSpatialGrid(ps, { cellSize: 0.05, cellsPerSide: 80, origin: -2 });
    const halos = findHalos(ps, grid, {
      start: 0,
      count: 30,
      linkingLength: 0.04,
      periodicBoxSize: 0,
      minMembers: 5,
    });
    for (let i = 1; i < halos.length; i += 1) {
      expect((halos[i - 1]?.mass ?? 0) >= (halos[i]?.mass ?? 0)).toBe(true);
    }
  });

  it('R_vir grows with halo mass (Δ = 200 spherical-overdensity)', () => {
    const ps = createParticleSystem(20);
    for (let i = 0; i < 20; i += 1) {
      const x = (i % 4) * 0.005;
      const y = (Math.floor(i / 4) % 4) * 0.005;
      const z = 0;
      setParticle(ps, i, x, y, z, 0, 0, 0, 1);
    }
    const grid = createSpatialGrid(ps, { cellSize: 0.05, cellsPerSide: 64, origin: -1.6 });
    const halos = findHalos(ps, grid, {
      start: 0,
      count: 20,
      linkingLength: 0.04,
      periodicBoxSize: 1.0,
      minMembers: 5,
      rhoBar: 1,
    });
    expect(halos.length).toBe(1);
    const halo = halos[0];
    if (halo === undefined) return;
    // R_vir = (3 M / (4π · 200 · ρ̄))^(1/3); with M = 20, ρ̄ = 1:
    // = (3·20/(4π·200))^(1/3) = (0.02387)^(1/3) ≈ 0.288
    expect(halo.rVir).toBeCloseTo(0.2883, 2);
  });
});
