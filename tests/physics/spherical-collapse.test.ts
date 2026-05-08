import { describe, expect, it } from 'vitest';
import {
  computeAccelerations,
  createLeapfrogState,
  centralDensity,
  energyReport,
  leapfrogStep,
  sphericalPerturbation,
} from '../../src/physics';

describe('spherical collapse', () => {
  // Top-hat sphere of uniform density ρ̄ collapses with turnaround time
  //   t_TA = (3π / (32 G ρ̄))^(1/2)
  // (Mo, van den Bosch & White §5.1; for an unperturbed maximum at t=0 this is
  // half the dynamical time of a free-fall to a point). We use it as an
  // order-of-magnitude check on the integrator.
  it('spherical perturbation collapses, central density grows monotonically through ~ t_FF', () => {
    const G = 1;
    const M = 1;
    const R = 1;
    const ps = sphericalPerturbation({
      count: 400,
      seed: 3,
      boxHalfExtent: R,
      perturbationRadius: 0.5,
      perturbationAmplitude: 0.05,
      totalMass: M,
    });

    // Mean density of the unit sphere with mass 1.
    const rhoBar = M / ((4 / 3) * Math.PI * R * R * R);
    const tFreeFall = Math.sqrt((3 * Math.PI) / (32 * G * rhoBar));
    const dt = tFreeFall / 200;
    const opts = { softening: 0.04, G };

    const state = createLeapfrogState(ps, (s) => {
      computeAccelerations(s, opts);
    });

    const probeRadius = 0.2;
    const rho0 = centralDensity(ps, probeRadius);

    let rhoMax = rho0;
    // Run for ~ one free-fall time. We expect central density to grow
    // significantly before turnaround/relaxation.
    for (let i = 0; i < 200; i += 1) {
      leapfrogStep(state, dt);
      const rho = centralDensity(ps, probeRadius);
      if (rho > rhoMax) rhoMax = rho;
    }

    // Central density should grow by at least 2× during the collapse.
    expect(rhoMax).toBeGreaterThan(rho0 * 2);
  });

  it('energy is conserved during spherical collapse to within 5 %', () => {
    const G = 1;
    const ps = sphericalPerturbation({
      count: 300,
      seed: 4,
      boxHalfExtent: 1,
      perturbationRadius: 0.5,
      perturbationAmplitude: 0.05,
      totalMass: 1,
    });
    const opts = { softening: 0.05, G };
    const state = createLeapfrogState(ps, (s) => {
      computeAccelerations(s, opts);
    });
    const E0 = energyReport(ps, opts).total;
    for (let i = 0; i < 500; i += 1) leapfrogStep(state, 5e-3);
    const E1 = energyReport(ps, opts).total;
    expect(Math.abs((E1 - E0) / E0)).toBeLessThan(0.05);
  });
});
