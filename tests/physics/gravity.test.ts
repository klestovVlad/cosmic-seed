import { describe, expect, it } from 'vitest';
import {
  computeAccelerations,
  createParticleSystem,
  potentialEnergy,
  setParticle,
} from '../../src/physics';

describe('CPU gravity', () => {
  it('softening keeps the force finite at r → 0', () => {
    const ps = createParticleSystem(2);
    setParticle(ps, 0, 0, 0, 0, 0, 0, 0, 1);
    setParticle(ps, 1, 0, 0, 0, 0, 0, 0, 1);
    computeAccelerations(ps, { softening: 0.1, G: 1 });
    expect(Number.isFinite(ps.accelerations[0])).toBe(true);
    expect(Number.isFinite(ps.accelerations[1])).toBe(true);
  });

  it('two equal point masses pull each other with equal and opposite force', () => {
    const ps = createParticleSystem(2);
    const r = 2;
    setParticle(ps, 0, -r / 2, 0, 0, 0, 0, 0, 1);
    setParticle(ps, 1, r / 2, 0, 0, 0, 0, 0, 1);
    computeAccelerations(ps, { softening: 1e-3, G: 1 });

    expect(ps.accelerations[0]).toBeGreaterThan(0);
    expect(ps.accelerations[4]).toBeLessThan(0);
    const a0x = ps.accelerations[0] ?? 0;
    const a1x = ps.accelerations[4] ?? 0;
    expect(Math.abs(a0x + a1x)).toBeLessThan(1e-6);
    expect(ps.accelerations[1]).toBeCloseTo(0, 6);
    expect(ps.accelerations[2]).toBeCloseTo(0, 6);
  });

  it('matches Newtonian inverse-square at distances much larger than softening', () => {
    const ps = createParticleSystem(2);
    const r = 5;
    setParticle(ps, 0, 0, 0, 0, 0, 0, 0, 3);
    setParticle(ps, 1, r, 0, 0, 0, 0, 0, 1);
    computeAccelerations(ps, { softening: 1e-3, G: 1 });
    // Acceleration on particle 0 from particle 1: G·m₁/r² = 1/25 = 0.04 in +x.
    expect(ps.accelerations[0]).toBeCloseTo(1 / (r * r), 4);
    // Acceleration on particle 1 from particle 0: G·m₀/r² = 3/25 = 0.12 in −x.
    expect(ps.accelerations[4]).toBeCloseTo(-3 / (r * r), 4);
  });

  it('potential energy of a known pair matches the analytic value', () => {
    const ps = createParticleSystem(2);
    setParticle(ps, 0, 0, 0, 0, 0, 0, 0, 1);
    setParticle(ps, 1, 4, 0, 0, 0, 0, 0, 1);
    const U = potentialEnergy(ps, { softening: 1e-3, G: 1 });
    expect(U).toBeCloseTo(-1 / 4, 3);
  });
});
