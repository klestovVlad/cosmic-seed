// Simulation controller: owns the particle system + leapfrog state, advances
// it on demand, and produces typed snapshots for the renderer and HUD.
// RULES §8 — controllers live here, stores stay dumb.

import {
  centralDensity,
  computeAccelerations,
  createLeapfrogState,
  energyReport,
  type LeapfrogState,
  leapfrogStep,
  momentumReport,
  type ParticleSystem,
  sphericalPerturbation,
} from '@physics/index';

export interface SimulationConfig {
  readonly count: number;
  readonly seed: number;
  readonly boxHalfExtent: number;
  readonly perturbationRadius: number;
  readonly perturbationAmplitude: number;
  readonly totalMass: number;
  readonly G: number;
  readonly softening: number;
  readonly dt: number;
  /** Probe radius for the central-density estimate (HUD only). */
  readonly densityProbeRadius: number;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  count: 1500,
  seed: 42,
  boxHalfExtent: 1,
  perturbationRadius: 0.5,
  perturbationAmplitude: 0.08,
  totalMass: 1,
  G: 1,
  softening: 0.04,
  dt: 4e-3,
  densityProbeRadius: 0.2,
};

export interface SimulationSnapshot {
  readonly step: number;
  readonly time: number;
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
  readonly totalEnergy: number;
  readonly initialTotalEnergy: number;
  readonly virialRatio: number;
  readonly centralDensity: number;
  readonly maxCentralDensity: number;
  readonly momentumMagnitude: number;
}

export interface SimulationRunner {
  readonly config: SimulationConfig;
  getSystem(): ParticleSystem;
  step(): void;
  snapshot(): SimulationSnapshot;
}

export function createSimulationRunner(
  config: SimulationConfig = DEFAULT_CONFIG,
): SimulationRunner {
  const opts = { softening: config.softening, G: config.G };
  const system = sphericalPerturbation(config);
  const state: LeapfrogState = createLeapfrogState(system, (s) => {
    computeAccelerations(s, opts);
  });

  const initialTotalEnergy = energyReport(system, opts).total;
  let maxCentral = centralDensity(system, config.densityProbeRadius);

  return {
    config,
    getSystem(): ParticleSystem {
      return system;
    },
    step(): void {
      leapfrogStep(state, config.dt);
    },
    snapshot(): SimulationSnapshot {
      const { kinetic, potential, total, virialRatio } = energyReport(system, opts);
      const rho = centralDensity(system, config.densityProbeRadius);
      if (rho > maxCentral) maxCentral = rho;
      return {
        step: state.step,
        time: state.time,
        kineticEnergy: kinetic,
        potentialEnergy: potential,
        totalEnergy: total,
        initialTotalEnergy,
        virialRatio,
        centralDensity: rho,
        maxCentralDensity: maxCentral,
        momentumMagnitude: momentumReport(system).magnitude,
      };
    },
  };
}
