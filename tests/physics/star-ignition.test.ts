import { describe, expect, it } from 'vitest';
import {
  criticalHaloMass,
  evaluateIgnition,
  type Halo,
  igniteEligibleHalos,
  redshift,
} from '../../src/physics';

const baseParams = { J_LW: 0, v_bc: 0, unitMassPerMsun: 1 };

describe('Kulkarni+2021 critical halo mass', () => {
  it('M_crit at z = 19, J_LW = 0, v_bc = 0 ≈ 1.69 × 10⁶ M☉', () => {
    // ((1+19)/20)^(-1.58) = 1, so the formula is just 1.69e6.
    const m = criticalHaloMass(redshift(19), baseParams);
    expect(m).toBeCloseTo(1.69e6, 0);
  });

  it('M_crit decreases with redshift (later halos need more mass)', () => {
    const m_z30 = criticalHaloMass(redshift(30), baseParams);
    const m_z19 = criticalHaloMass(redshift(19), baseParams);
    const m_z10 = criticalHaloMass(redshift(10), baseParams);
    expect(m_z30).toBeLessThan(m_z19);
    expect(m_z19).toBeLessThan(m_z10);
  });

  it('Lyman–Werner background raises M_crit', () => {
    const noLW = criticalHaloMass(redshift(20), baseParams);
    const withLW = criticalHaloMass(redshift(20), { ...baseParams, J_LW: 100 });
    expect(withLW).toBeGreaterThan(noLW);
  });

  it('streaming velocity raises M_crit', () => {
    const noVbc = criticalHaloMass(redshift(20), baseParams);
    const withVbc = criticalHaloMass(redshift(20), { ...baseParams, v_bc: 60 });
    expect(withVbc).toBeGreaterThan(noVbc);
  });

  it('unitMassPerMsun scales the result linearly', () => {
    const codeUnit = criticalHaloMass(redshift(20), baseParams);
    const scaled = criticalHaloMass(redshift(20), { ...baseParams, unitMassPerMsun: 100 });
    expect(scaled / codeUnit).toBeCloseTo(100, 5);
  });
});

const tinyHalo = (mass: number): Halo => ({
  cx: 0,
  cy: 0,
  cz: 0,
  mass,
  memberCount: 10,
  rVir: 0.1,
  vCirc: 1,
});

describe('evaluateIgnition', () => {
  it('halo below M_crit cannot ignite', () => {
    const decision = evaluateIgnition(tinyHalo(1e5), redshift(20), baseParams);
    expect(decision.canIgnite).toBe(false);
  });

  it('halo above M_crit can ignite', () => {
    const decision = evaluateIgnition(tinyHalo(1e7), redshift(20), baseParams);
    expect(decision.canIgnite).toBe(true);
  });
});

describe('igniteEligibleHalos', () => {
  it('only newly-eligible halos produce stars; already-lit halos skipped', () => {
    const halos = [tinyHalo(1e7), tinyHalo(1e6), tinyHalo(1e8)];
    const ids = [101, 102, 103];
    const lit = new Set<number>();
    const r = igniteEligibleHalos(halos, ids, redshift(20), lit, baseParams);
    // 1e6 is below M_crit (~1.69e6), the others above.
    expect(r.newStars.length).toBe(2);
    expect(r.newlyLit).toEqual([101, 103]);
    expect(lit.has(101)).toBe(true);
    // Run again — no new stars (already-lit set was mutated).
    const r2 = igniteEligibleHalos(halos, ids, redshift(20), lit, baseParams);
    expect(r2.newStars.length).toBe(0);
  });

  it('star mass = 1e-3 × halo mass (POPIII_EFFICIENCY)', () => {
    const halos = [tinyHalo(1e7)];
    const ids = [42];
    const lit = new Set<number>();
    const r = igniteEligibleHalos(halos, ids, redshift(20), lit, baseParams);
    expect(r.newStars[0]?.mass).toBeCloseTo(1e7 * 1e-3, 3);
  });
});
