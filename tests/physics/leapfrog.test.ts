import { describe, expect, it } from 'vitest';
import {
  computeAccelerations,
  createLeapfrogState,
  energyReport,
  keplerTwoBody,
  leapfrogStep,
  type ParticleSystem,
  plummerSphere,
} from '../../src/physics';

describe('leapfrog KDK', () => {
  it('preserves energy on a circular Kepler orbit (drift < 0.1 % over 100 orbits)', () => {
    const G = 1;
    const r = 1;
    const M = 1;
    const ps = keplerTwoBody({ centralMass: M, satelliteMass: 1e-3, radius: r, G });
    const orbitPeriod = 2 * Math.PI * Math.sqrt(r ** 3 / (G * M));
    const dt = orbitPeriod / 200;
    const orbits = 100;

    const opts = { softening: 1e-3, G };
    const state = createLeapfrogState(ps, (s) => {
      computeAccelerations(s, opts);
    });

    const E0 = energyReport(ps, opts).total;
    for (let i = 0; i < orbits * 200; i += 1) {
      leapfrogStep(state, dt);
    }
    const E1 = energyReport(ps, opts).total;

    const drift = Math.abs((E1 - E0) / E0);
    expect(drift).toBeLessThan(1e-3);
  });

  it('preserves total momentum on an isolated system (Plummer sphere, 1000 steps)', () => {
    const G = 1;
    const ps = plummerSphere({ count: 200, seed: 1, scale: 1, totalMass: 1, G });
    centerOnRest(ps);

    const opts = { softening: 0.05, G };
    const state = createLeapfrogState(ps, (s) => {
      computeAccelerations(s, opts);
    });
    const dt = 1e-3;
    const p0 = momentumMag(ps);
    for (let i = 0; i < 1000; i += 1) leapfrogStep(state, dt);
    const p1 = momentumMag(ps);
    expect(Math.abs(p1 - p0)).toBeLessThan(1e-6);
  });

  it('keeps energy drift under 1 % on a Plummer sphere over 1000 steps', () => {
    const G = 1;
    const ps = plummerSphere({ count: 200, seed: 2, scale: 1, totalMass: 1, G });
    centerOnRest(ps);

    const opts = { softening: 0.05, G };
    const state = createLeapfrogState(ps, (s) => {
      computeAccelerations(s, opts);
    });
    const dt = 5e-3;
    const E0 = energyReport(ps, opts).total;
    for (let i = 0; i < 1000; i += 1) leapfrogStep(state, dt);
    const E1 = energyReport(ps, opts).total;
    expect(Math.abs((E1 - E0) / E0)).toBeLessThan(0.01);
  });
});

function momentumMag(ps: ParticleSystem): number {
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const m = ps.masses[i] ?? 0;
    px += (ps.velocities[j] ?? 0) * m;
    py += (ps.velocities[j + 1] ?? 0) * m;
    pz += (ps.velocities[j + 2] ?? 0) * m;
  }
  return Math.sqrt(px * px + py * py + pz * pz);
}

function centerOnRest(ps: ParticleSystem): void {
  let mx = 0;
  let my = 0;
  let mz = 0;
  let mTot = 0;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const m = ps.masses[i] ?? 0;
    mx += (ps.velocities[j] ?? 0) * m;
    my += (ps.velocities[j + 1] ?? 0) * m;
    mz += (ps.velocities[j + 2] ?? 0) * m;
    mTot += m;
  }
  const vxAvg = mx / mTot;
  const vyAvg = my / mTot;
  const vzAvg = mz / mTot;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    ps.velocities[j] = (ps.velocities[j] ?? 0) - vxAvg;
    ps.velocities[j + 1] = (ps.velocities[j + 1] ?? 0) - vyAvg;
    ps.velocities[j + 2] = (ps.velocities[j + 2] ?? 0) - vzAvg;
  }
}
