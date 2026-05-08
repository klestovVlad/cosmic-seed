// Simulation controller: owns the particle system + leapfrog state, advances
// it on demand, and produces typed snapshots for the renderer and HUD.
// RULES §8 — controllers live here, stores stay dumb.

import {
  centralDensity,
  computeAccelerations,
  computeDensities,
  createLeapfrogState,
  createSpatialGrid,
  type DensityKernel,
  energyReport,
  type LeapfrogState,
  leapfrogStep,
  momentumReport,
  type ParticleSystem,
  poly6Kernel,
  rebuildSpatialGrid,
  type SpatialGrid,
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
  /** Smoothing length for per-particle density used by the renderer. */
  readonly densityKernelRadius: number;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  // 1500 hits a comfortable ~30 fps on the CPU path. Stage 1c lifts this to
  // 10k once the WebGPU compute lands.
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
  densityKernelRadius: 0.12,
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
  readonly maxParticleDensity: number;
}

export interface SimulationRunner {
  readonly config: SimulationConfig;
  getSystem(): ParticleSystem;
  getDensities(): Float32Array;
  /** Recompute per-particle density from current positions. Cheap (uses spatial grid). */
  refreshDensities(): void;
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

  const densities = new Float32Array(config.count);
  const kernel: DensityKernel = poly6Kernel(config.densityKernelRadius);
  // Allow the cluster to drift modestly outside the unit box during collapse.
  const gridExtent = Math.max(2 * config.boxHalfExtent, 4);
  const cellsPerSide = Math.max(8, Math.ceil(gridExtent / config.densityKernelRadius));
  const grid: SpatialGrid = createSpatialGrid(system, {
    cellSize: gridExtent / cellsPerSide,
    cellsPerSide,
    origin: -gridExtent / 2,
  });

  let maxParticleDensity = 0;

  const refreshDensities = (): void => {
    rebuildSpatialGrid(grid, system);
    computeDensities(system, grid, kernel, densities);
    let maxRho = 0;
    for (const rho of densities) {
      if (rho > maxRho) maxRho = rho;
    }
    if (maxRho > maxParticleDensity) maxParticleDensity = maxRho;
  };

  // Prime the density buffer so the first render isn't blank.
  refreshDensities();

  return {
    config,
    getSystem(): ParticleSystem {
      return system;
    },
    getDensities(): Float32Array {
      return densities;
    },
    refreshDensities,
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
        maxParticleDensity,
      };
    },
  };
}
