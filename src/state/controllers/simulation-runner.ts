// Simulation controller: owns the particle system + leapfrog state, advances
// it on demand, and produces typed snapshots for the renderer and HUD.
// RULES §8 — controllers live here, stores stay dumb.

import {
  aOfT,
  asNumber,
  centralDensity,
  codeUToKelvin,
  computeAccelerations,
  computeDensities,
  computeSphDensityForRange,
  computeSphForcesAndEnergy,
  cosmologicalLeapfrogStep,
  type CosmologyParams,
  createLeapfrogState,
  createSpatialGrid,
  cubicSplineKernel,
  DEFAULT_H2_NETWORK,
  type DensityKernel,
  energyReport,
  evolveH2Fraction,
  findHalos,
  type GasCoolingUnits,
  type H2NetworkParams,
  type Halo,
  type IgnitionParams,
  igniteEligibleHalos,
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
  type Star,
  subcycleCooling,
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
  /** Stage 4: how often (in physics steps) to rebuild the halo catalogue. */
  readonly haloFinderEveryKSteps: number;
  /** FoF linking length as a fraction of the mean inter-particle separation (b = 0.2 standard). */
  readonly haloLinkingFraction: number;
  /** Halos with fewer particles than this are noise and discarded. */
  readonly haloMinMembers: number;
  /**
   * Code-unit-mass-per-M☉ conversion. Used by the Kulkarni+2021 critical-mass
   * formula to get a code-unit threshold. Tuned so a halo of ~ 17 particles
   * crosses M_crit at z = 20 in our default 1024-particle box.
   */
  readonly unitMassPerMsun: number;
  /** Lyman-Werner background, 10⁻²¹ erg/s/cm²/Hz/sr. Default 0 (no LW). */
  readonly ignitionJ_LW: number;
  /** Streaming velocity v_bc in km/s. Default 0. */
  readonly ignitionVbc: number;
  /**
   * Stage 4c: enable primordial H₂ cooling in the gas-energy step. When
   * `false`, gas evolves adiabatically (Stage 3b behaviour).
   */
  readonly coolingEnabled: boolean;
  /** Code-u → Kelvin conversion (calibrated to the cosmological IC). */
  readonly gasUnitTempK: number;
  /** Code-density → cm⁻³ conversion at the IC redshift. */
  readonly gasUnitNumberDensityCgs: number;
  /** Seconds per code-time-unit. */
  readonly gasUnitTimePerSec: number;
  /**
   * Initial H₂ number-fraction relative to total H. Each gas particle
   * starts at this value; the Galli-Palla / Abel H₂ network in
   * `evolveH2Fraction` then builds it up in cool-dense regions and
   * relaxes it back under a Lyman-Werner background.
   */
  readonly gasH2BaselineFraction: number;
  /**
   * Stage 4c2: per-particle H₂ network parameters. Defaults to the
   * Galli-Palla / Abel literature values; tests can override to verify
   * monotonicity / equilibrium / floor behaviour.
   */
  readonly h2Network: H2NetworkParams;
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
  haloFinderEveryKSteps: 50,
  haloLinkingFraction: 0.2,
  haloMinMembers: 8,
  unitMassPerMsun: 1e-8,
  ignitionJ_LW: 0,
  ignitionVbc: 0,
  coolingEnabled: true,
  // Calibrated for the cosmological-mode default (boxHalfExtent = 0.5,
  // dt = 1.2e-3, dtMyr = 0.2). Stage 4c2 will compute these from the
  // cosmology + box-size config rather than treating them as opaque
  // free parameters; for now they're a documented adapter to physical
  // units, not a discovery.
  gasUnitTempK: 3.0e5,
  gasUnitNumberDensityCgs: 0.6,
  gasUnitTimePerSec: 5.27e15,
  gasH2BaselineFraction: 1e-6,
  h2Network: DEFAULT_H2_NETWORK,
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
  /** Stage 4c: coldest gas particle internal energy + matching T (K). */
  readonly gasMinInternalEnergy: number;
  readonly gasMinTemperatureK: number;
  /** Stage 4c2: peak per-particle H₂ fraction. Tracks how far the
   *  formation network has run in the densest cool gas. */
  readonly gasMaxH2Fraction: number;
  /** Mean H₂ fraction across all gas particles. */
  readonly gasMeanH2Fraction: number;
  /** Subcycle stats from the most recent cooling pass — useful when tuning. */
  readonly coolingMaxSubsteps: number;
  readonly coolingCappedThisStep: boolean;
  /** Stage 4: number of halos found at the most recent halo-finder pass. */
  readonly haloCount: number;
  /** Largest halo mass in code units, or 0 if no halos. */
  readonly largestHaloMass: number;
  /** Centre (code-unit position) of the most massive halo, null if none. */
  readonly largestHaloCentre: { x: number; y: number; z: number } | null;
  /** Number of stars currently lit (cumulative). */
  readonly starCount: number;
  /** First-ignition event: { z, mass } in M☉ + code-unit position. */
  readonly firstIgnition: {
    readonly redshift: number;
    readonly haloMassMsun: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null;
}

export interface SimulationRunner {
  readonly config: SimulationConfig;
  getSystem(): ParticleSystem;
  getDensities(): Float32Array;
  /** Internal energy per gas particle; length = gasCount. */
  getGasInternalEnergy(): Float32Array;
  /** SPH density per gas particle; length = gasCount. */
  getGasDensities(): Float32Array;
  /** Stars (read-only). Each star is a code-unit position + mass + birth redshift. */
  getStars(): readonly Star[];
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

  // Stage 4c2: per-particle H₂ tracker (Galli-Palla H⁻ formation +
  // Abel-1997 LW dissociation, implicit-Euler one-step). Each step the
  // network sees the particle's current T (from u) and n_H (from SPH ρ)
  // and steps x_H₂ — so cool-dense halo cores genuinely build up the
  // coolant over their dynamical time, rather than the Stage-4c flat
  // baseline that produced cooling everywhere in equal measure.
  const gasH2Fraction = new Float32Array(gasCount);
  const coolingUnits: GasCoolingUnits = {
    kelvinPerCodeU: config.gasUnitTempK,
    nHCgsPerCodeRho: config.gasUnitNumberDensityCgs,
    secondsPerCodeTime: config.gasUnitTimePerSec,
  };
  if (gasCount > 0) gasH2Fraction.fill(config.gasH2BaselineFraction);
  let coolingMaxSubstepsThisStep = 0;
  let coolingCappedThisStep = false;

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

  // Stage 4: halo finder + star ignition.
  // We allocate the halo grid once, sized to the periodic box, with cellSize
  // = the linking length so the 27-cell stencil captures all neighbours.
  const meanSeparation =
    config.cosmologicalMode && config.count > 0
      ? Math.cbrt((2 * config.boxHalfExtent) ** 3 / config.count)
      : 0.1;
  const haloLinkingLength = config.haloLinkingFraction * meanSeparation;
  const haloPeriodicSize = config.cosmologicalMode ? 2 * config.boxHalfExtent : 0;
  // CellSize must be ≥ linkingLength; cellsPerSide × cellSize must equal box size.
  const haloCellSize = Math.max(haloLinkingLength, 1e-3);
  const haloCellsPerSide =
    haloPeriodicSize > 0
      ? Math.max(4, Math.floor(haloPeriodicSize / haloCellSize))
      : Math.max(8, Math.ceil(4 / haloCellSize));
  const haloGrid: SpatialGrid = createSpatialGrid(system, {
    cellSize: haloPeriodicSize > 0 ? haloPeriodicSize / haloCellsPerSide : haloCellSize,
    cellsPerSide: haloCellsPerSide,
    origin: haloPeriodicSize > 0 ? -haloPeriodicSize / 2 : -2,
  });
  const ignitionParams: IgnitionParams = {
    J_LW: config.ignitionJ_LW,
    v_bc: config.ignitionVbc,
    unitMassPerMsun: config.unitMassPerMsun,
  };
  let latestHalos: Halo[] = [];
  const stars: Star[] = [];
  let firstIgnition: SimulationSnapshot['firstIgnition'] = null;
  let lastHaloFinderStep = -1;

  /** Has the halo at `cx,cy,cz,rVir` already lit a star? Spatial proximity test. */
  const haloIsAlreadyLit = (h: Halo): boolean => {
    const r2 = h.rVir * h.rVir;
    for (const s of stars) {
      const dx = h.cx - s.x;
      const dy = h.cy - s.y;
      const dz = h.cz - s.z;
      if (dx * dx + dy * dy + dz * dz < r2) return true;
    }
    return false;
  };

  const runHaloFinderAndIgnite = (): void => {
    if (config.count === 0) return;
    latestHalos = findHalos(system, haloGrid, {
      start: 0,
      count: config.count,
      linkingLength: haloLinkingLength,
      periodicBoxSize: haloPeriodicSize,
      minMembers: config.haloMinMembers,
      G: config.G,
    });

    // Filter to halos that haven't already lit (spatial proximity check).
    const eligible: Halo[] = [];
    const eligibleIds: number[] = [];
    for (let i = 0; i < latestHalos.length; i += 1) {
      const halo = latestHalos[i];
      if (halo === undefined) continue;
      if (haloIsAlreadyLit(halo)) continue;
      eligible.push(halo);
      eligibleIds.push(i);
    }

    const aNow = aOfT(myr(ageInMyr), config.cosmology);
    const zNow = zOfA(aNow);
    const result = igniteEligibleHalos(eligible, eligibleIds, zNow, new Set(), ignitionParams);
    for (const star of result.newStars) stars.push(star);
    if (firstIgnition === null && result.newStars.length > 0) {
      const first = result.newStars[0];
      if (first !== undefined) {
        firstIgnition = {
          redshift: first.redshift,
          haloMassMsun: first.hostHaloMass / config.unitMassPerMsun,
          x: first.x,
          y: first.y,
          z: first.z,
        };
      }
    }
  };

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
    getStars: () => stars,
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
      // Halo finder + star ignition every K steps. Pre-prime on first step.
      if (
        config.cosmologicalMode &&
        (lastHaloFinderStep === -1 ||
          state.step - lastHaloFinderStep >= config.haloFinderEveryKSteps)
      ) {
        runHaloFinderAndIgnite();
        lastHaloFinderStep = state.step;
      }
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

      // Stage 4c: H₂ cooling. Runs after the adiabatic update so any
      // compression-heating amplification is the input to the radiative
      // sink. Subcycled per-particle — cooling time can be much shorter
      // than the macro step in dense-core gas, but is order-of-magnitude
      // longer in the diffuse IGM, so a global timestep choice would be
      // wrong either way.
      //
      // Stage 4c2 inserts an H₂ network step before cooling: x_H₂ now
      // grows in the cool-dense gas where the formation rate dominates
      // and relaxes back under a Lyman-Werner background.
      if (gasCount > 0 && config.coolingEnabled) {
        coolingMaxSubstepsThisStep = 0;
        coolingCappedThisStep = false;
        const dtSeconds = config.dt * coolingUnits.secondsPerCodeTime;
        for (let g = 0; g < gasCount; g += 1) {
          const u = gasInternalEnergy[g] ?? 0;
          const rho = gasDensities[g] ?? 0;
          if (u <= 0 || rho <= 0) continue;
          const T = codeUToKelvin(u, coolingUnits);
          const nH = rho * coolingUnits.nHCgsPerCodeRho;
          const xH2 = evolveH2Fraction({
            xH2: gasH2Fraction[g] ?? config.gasH2BaselineFraction,
            temperatureK: T,
            nHCgs: nH,
            jLW: config.ignitionJ_LW,
            dtSeconds,
            params: config.h2Network,
          });
          gasH2Fraction[g] = xH2;
          if (xH2 <= 0) continue;
          const result = subcycleCooling({
            uCode: u,
            rhoCode: rho,
            xH2,
            dtCode: config.dt,
            units: coolingUnits,
          });
          gasInternalEnergy[g] = Math.max(result.uCode, 1e-9);
          if (result.substeps > coolingMaxSubstepsThisStep) {
            coolingMaxSubstepsThisStep = result.substeps;
          }
          if (result.capped) coolingCappedThisStep = true;
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
        coolingMaxSubsteps: coolingMaxSubstepsThisStep,
        coolingCappedThisStep,
        haloCount: latestHalos.length,
        largestHaloMass: latestHalos[0]?.mass ?? 0,
        largestHaloCentre:
          latestHalos[0] !== undefined
            ? { x: latestHalos[0].cx, y: latestHalos[0].cy, z: latestHalos[0].cz }
            : null,
        starCount: stars.length,
        firstIgnition,
      };
    },
  };

  function gasStats(): {
    gasMassFraction: number;
    gasMeanInternalEnergy: number;
    gasMaxInternalEnergy: number;
    gasMinInternalEnergy: number;
    gasMinTemperatureK: number;
    gasMaxH2Fraction: number;
    gasMeanH2Fraction: number;
  } {
    if (gasCount === 0) {
      return {
        gasMassFraction: 0,
        gasMeanInternalEnergy: 0,
        gasMaxInternalEnergy: 0,
        gasMinInternalEnergy: 0,
        gasMinTemperatureK: 0,
        gasMaxH2Fraction: 0,
        gasMeanH2Fraction: 0,
      };
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
    let minU = Number.POSITIVE_INFINITY;
    let sumX = 0;
    let maxX = 0;
    for (let g = 0; g < gasCount; g += 1) {
      const u = gasInternalEnergy[g] ?? 0;
      sumU += u;
      if (u > maxU) maxU = u;
      if (u < minU) minU = u;
      const x = gasH2Fraction[g] ?? 0;
      sumX += x;
      if (x > maxX) maxX = x;
    }
    if (!Number.isFinite(minU)) minU = 0;
    return {
      gasMassFraction: totalMass > 0 ? gasMass / totalMass : 0,
      gasMeanInternalEnergy: sumU / gasCount,
      gasMaxInternalEnergy: maxU,
      gasMinInternalEnergy: minU,
      gasMinTemperatureK: codeUToKelvin(minU, coolingUnits),
      gasMaxH2Fraction: maxX,
      gasMeanH2Fraction: sumX / gasCount,
    };
  }
}

function isOptions(
  v: SimulationConfig | CreateSimulationRunnerOptions,
): v is CreateSimulationRunnerOptions {
  return 'config' in v || 'initialSystem' in v;
}
