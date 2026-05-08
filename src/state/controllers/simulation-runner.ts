// Simulation controller: owns the particle system + leapfrog state, advances
// it on demand, and produces typed snapshots for the renderer and HUD.
// RULES §8 — controllers live here, stores stay dumb.

import {
  aOfT,
  asNumber,
  centralDensity,
  computeAccelerations,
  computeDensities,
  type CosmologyParams,
  createLeapfrogState,
  createSpatialGrid,
  type DensityKernel,
  energyReport,
  type LeapfrogState,
  leapfrogStep,
  momentumReport,
  myr,
  type ParticleSystem,
  PLANCK_2018,
  poly6Kernel,
  type Redshift,
  rebuildSpatialGrid,
  redshift,
  scaleFactor,
  type SpatialGrid,
  sphericalPerturbation,
  tOfA,
  zOfA,
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
  /** Cosmology used for time/scale-factor bookkeeping (Stage 2c+). */
  readonly cosmology: CosmologyParams;
  /** Redshift at which the simulation is considered to start. */
  readonly zInit: Redshift;
  /**
   * How many Myr of cosmic time elapse per physics step. Currently independent
   * of the `dt` used in the integrator (which is in code units); Stage 2c2
   * unifies them by switching the leapfrog into comoving coordinates.
   */
  readonly dtMyr: number;
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
  cosmology: PLANCK_2018,
  zInit: redshift(100),
  // 0.6 Myr per step × ~ 240 steps/sec = 144 Myr / real-second.
  // The z = 100 → z = 6 window is about 920 Myr, so a full run is ~ 6 sec
  // of real-time simulation. Adjust in Stage 5 with the speed slider.
  dtMyr: 0.6,
};

export interface SimulationSnapshot {
  readonly step: number;
  /** Code-unit integrator time. */
  readonly time: number;
  /** Cosmic time since Big Bang, Myr. */
  readonly ageInMyr: number;
  /** Scale factor a(t). */
  readonly scaleFactor: number;
  /** Redshift z = 1/a − 1. */
  readonly redshift: number;
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

  // Cosmic time bookkeeping. The integrator runs in code units (legacy from
  // Stage 1); the cosmological clock advances by `dtMyr` per physics step
  // and is read by the HUD's TimeStrip. Stage 2c2 will unify these by
  // switching to a comoving leapfrog whose `dt` is also in Myr.
  const initialTimeMyr = asNumber(
    tOfA(scaleFactor(1 / (1 + asNumber(config.zInit))), config.cosmology),
  );
  let ageInMyr = initialTimeMyr;

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
      ageInMyr += config.dtMyr;
    },
    snapshot(): SimulationSnapshot {
      const { kinetic, potential, total, virialRatio } = energyReport(system, opts);
      const rho = centralDensity(system, config.densityProbeRadius);
      if (rho > maxCentral) maxCentral = rho;
      const a = aOfT(myr(ageInMyr), config.cosmology);
      const z = zOfA(a);
      return {
        step: state.step,
        time: state.time,
        ageInMyr,
        scaleFactor: asNumber(a),
        redshift: asNumber(z),
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
