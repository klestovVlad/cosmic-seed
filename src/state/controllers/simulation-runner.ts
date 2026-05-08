// Simulation controller: owns the particle system + leapfrog state, advances
// it on demand, and produces typed snapshots for the renderer and HUD.
// RULES §8 — controllers live here, stores stay dumb.

import {
  aOfT,
  asNumber,
  centralDensity,
  computeAccelerations,
  computeDensities,
  computeSphDensityForRange,
  computeSphForcesAndEnergy,
  cosmologicalLeapfrogStep,
  type CosmologyParams,
  createLeapfrogState,
  createSpatialGrid,
  cubicSplineKernel,
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
  type SphKernel,
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
   * How many Myr of cosmic time elapse per physics step. In cosmological
   * mode this also drives the drift-scale update via aOfT(time).
   */
  readonly dtMyr: number;
  /**
   * Cosmological mode (Stage 2c2): runs the comoving leapfrog with periodic
   * min-image gravity and a `1/a²` drift scale. The simulation evolves a
   * Gaussian random field into a cosmic web. Default `false` keeps the
   * Stage-1 spherical-collapse behaviour.
   */
  readonly cosmologicalMode: boolean;
  /**
   * Stage 3b: number of gas (baryon) particles in addition to `count` DM
   * particles. Total particles in the runner's ParticleSystem is
   * `count + gasCount`; gas occupies indices [count, count + gasCount).
   * `0` keeps the runner pure dark-matter (legacy Stage 2 behaviour).
   */
  readonly gasCount: number;
  /** Initial internal energy u₀ per gas particle (code units). */
  readonly gasInitialEnergy: number;
  /** SPH smoothing length h. Kernel support is 2h. */
  readonly gasSmoothingLength: number;
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
  cosmologicalMode: false,
  gasCount: 0,
  gasInitialEnergy: 1e-3,
  gasSmoothingLength: 0.06,
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
  /** Stage 3b: gas-specific diagnostics. Zero/NaN when gasCount = 0. */
  readonly gasMassFraction: number;
  readonly gasMeanInternalEnergy: number;
  readonly gasMaxInternalEnergy: number;
}

export interface SimulationRunner {
  readonly config: SimulationConfig;
  getSystem(): ParticleSystem;
  getDensities(): Float32Array;
  /** Internal energy per gas particle; length = gasCount. */
  getGasInternalEnergy(): Float32Array;
  /** SPH density per gas particle; length = gasCount. */
  getGasDensities(): Float32Array;
  /** Recompute per-particle density from current positions. Cheap (uses spatial grid). */
  refreshDensities(): void;
  step(): void;
  snapshot(): SimulationSnapshot;
}

export interface CreateSimulationRunnerOptions {
  readonly config?: SimulationConfig;
  /** Optional pre-built initial system. Defaults to `sphericalPerturbation(config)`. */
  readonly initialSystem?: ParticleSystem;
}

export function createSimulationRunner(
  configOrOptions: SimulationConfig | CreateSimulationRunnerOptions = DEFAULT_CONFIG,
): SimulationRunner {
  // Backward-compat: caller may pass a SimulationConfig directly.
  const opts0: CreateSimulationRunnerOptions = isOptions(configOrOptions)
    ? configOrOptions
    : { config: configOrOptions };
  const config = opts0.config ?? DEFAULT_CONFIG;
  const gasCount = config.gasCount;
  const gasStart = config.count; // DM occupy [0, count); gas at [count, count + gasCount)
  const total = config.count + gasCount;

  const gravityOpts = config.cosmologicalMode
    ? { softening: config.softening, G: config.G, periodicBoxSize: 2 * config.boxHalfExtent }
    : { softening: config.softening, G: config.G };
  const system = opts0.initialSystem ?? sphericalPerturbation(config);

  // SPH state — only allocated when there's actual gas.
  const sphKernel: SphKernel | null =
    gasCount > 0 ? cubicSplineKernel(config.gasSmoothingLength) : null;
  const sphGrid: SpatialGrid | null =
    sphKernel !== null
      ? createSpatialGrid(system, {
          cellSize: sphKernel.support,
          cellsPerSide: Math.max(8, Math.ceil((2 * config.boxHalfExtent) / sphKernel.support)),
          origin: -config.boxHalfExtent,
        })
      : null;
  const gasDensities = new Float32Array(gasCount);
  const gasInternalEnergy = new Float32Array(gasCount);
  const sphPressureAccels = new Float32Array(gasCount * 4);
  const sphDudt = new Float32Array(gasCount);
  if (gasCount > 0) gasInternalEnergy.fill(config.gasInitialEnergy);

  // Combined force evaluator: gravity for all + SPH pressure for gas.
  const evaluateForces = (s: ParticleSystem): void => {
    computeAccelerations(s, gravityOpts);
    if (gasCount > 0 && sphKernel !== null && sphGrid !== null) {
      rebuildSpatialGrid(sphGrid, s);
      computeSphDensityForRange(s, sphGrid, sphKernel, gasStart, gasCount, gasDensities);
      computeSphForcesAndEnergy(
        s,
        sphGrid,
        sphKernel,
        {
          gasStart,
          gasCount,
          gamma: 5 / 3,
          internalEnergy: gasInternalEnergy,
          densities: gasDensities,
        },
        { accelerations: sphPressureAccels, dudt: sphDudt },
      );
      // Add pressure-gradient acceleration to gas particles' main accel.
      for (let g = 0; g < gasCount; g += 1) {
        const idx = (gasStart + g) * 4;
        const oi = g * 4;
        s.accelerations[idx] = (s.accelerations[idx] ?? 0) + (sphPressureAccels[oi] ?? 0);
        s.accelerations[idx + 1] =
          (s.accelerations[idx + 1] ?? 0) + (sphPressureAccels[oi + 1] ?? 0);
        s.accelerations[idx + 2] =
          (s.accelerations[idx + 2] ?? 0) + (sphPressureAccels[oi + 2] ?? 0);
      }
    }
  };

  const state: LeapfrogState = createLeapfrogState(system, evaluateForces);

  const initialTotalEnergy = energyReport(system, gravityOpts).total;
  let maxCentral = centralDensity(system, config.densityProbeRadius);

  // Density buffer for the renderer's poly6 visualisation. Sized to the DM
  // count: we only colour DM by density. Gas is coloured by temperature.
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
    // computeDensities operates over the whole system but writes only the
    // first `densities.length` slots. We pass DM-only output here so gas
    // particles don't pollute the violet density mapping.
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
    getGasInternalEnergy: () => gasInternalEnergy,
    getGasDensities: () => gasDensities,
    step(): void {
      if (config.cosmologicalMode) {
        const a = aOfT(myr(ageInMyr), config.cosmology);
        const aNum = asNumber(a);
        cosmologicalLeapfrogStep(state, config.dt, {
          driftScale: 1 / Math.max(aNum * aNum, 1e-12),
          periodicBoxSize: 2 * config.boxHalfExtent,
        });
      } else {
        leapfrogStep(state, config.dt);
      }
      ageInMyr += config.dtMyr;
      // Adiabatic energy update: u → u + dudt · dt. The dudt was filled
      // by the most recent force evaluation inside the leapfrog. Floor at a
      // small positive value so finite-precision drift can't make pressure
      // negative.
      if (gasCount > 0) {
        for (let g = 0; g < gasCount; g += 1) {
          const next = (gasInternalEnergy[g] ?? 0) + (sphDudt[g] ?? 0) * config.dt;
          gasInternalEnergy[g] = next > 1e-9 ? next : 1e-9;
        }
      }
    },
    snapshot(): SimulationSnapshot {
      const { kinetic, potential, total, virialRatio } = energyReport(system, gravityOpts);
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
        ...gasStats(),
      };
    },
  };

  function gasStats(): {
    gasMassFraction: number;
    gasMeanInternalEnergy: number;
    gasMaxInternalEnergy: number;
  } {
    if (gasCount === 0) {
      return { gasMassFraction: 0, gasMeanInternalEnergy: 0, gasMaxInternalEnergy: 0 };
    }
    let totalMass = 0;
    let gasMass = 0;
    for (let i = 0; i < total; i += 1) {
      const m = system.masses[i] ?? 0;
      totalMass += m;
      if (i >= gasStart) gasMass += m;
    }
    let sumU = 0;
    let maxU = 0;
    for (let g = 0; g < gasCount; g += 1) {
      const u = gasInternalEnergy[g] ?? 0;
      sumU += u;
      if (u > maxU) maxU = u;
    }
    return {
      gasMassFraction: totalMass > 0 ? gasMass / totalMass : 0,
      gasMeanInternalEnergy: sumU / gasCount,
      gasMaxInternalEnergy: maxU,
    };
  }
}

function isOptions(
  v: SimulationConfig | CreateSimulationRunnerOptions,
): v is CreateSimulationRunnerOptions {
  return 'config' in v || 'initialSystem' in v;
}
