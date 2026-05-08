// Frame runner: the unified async interface the render loop talks to.
// Hides whether the underlying simulation is CPU-only or GPU-accelerated.
//
// CPU implementation just wraps the existing synchronous SimulationRunner.
// GPU implementation queues a frame's worth of compute on a WebGPU device,
// reads positions back, and computes density on CPU from the readback.

import {
  aOfT,
  asNumber,
  centralDensity,
  computeDensities,
  createParticleSystem,
  createSpatialGrid,
  type DensityKernel,
  energyReport,
  findHalos,
  type Halo,
  type IgnitionParams,
  igniteEligibleHalos,
  momentumReport,
  myr,
  type ParticleSystem,
  poly6Kernel,
  rebuildSpatialGrid,
  redshift,
  scaleFactor,
  sphericalPerturbation,
  type SpatialGrid,
  type Star,
  tOfA,
  zOfA,
} from '@physics/index';
import type { GpuContext } from '@rendering/gpu/device';
import { createGpuRunner, type GpuRunner } from '@rendering/gpu/gpu-runner';
import {
  createSimulationRunner,
  type SimulationConfig,
  type SimulationRunner,
  type SimulationSnapshot,
} from './simulation-runner';

export interface FrameData {
  /** total × 4 (xyz + pad) — full ParticleSystem positions (DM + gas). */
  readonly positions: Float32Array;
  /** dmCount — per-DM-particle smoothed density (poly6). */
  readonly densities: Float32Array;
  readonly maxDensity: number;
  /** Gas internal energy per particle, length = gasCount. Empty if gasCount=0. */
  readonly gasInternalEnergy: Float32Array;
  /** SPH density per gas particle, length = gasCount. */
  readonly gasDensities: Float32Array;
  /** Stage 4: stars currently lit. Read-only — runner appends as halos cross M_crit. */
  readonly stars: readonly { x: number; y: number; z: number; mass: number }[];
}

export interface FrameRunner {
  readonly mode: 'cpu' | 'gpu';
  /** Total particle count (DM + gas). */
  readonly count: number;
  /** DM particle count (positions [0, dmCount)). */
  readonly dmCount: number;
  /** Gas particle count (positions [dmCount, dmCount + gasCount)). */
  readonly gasCount: number;
  readonly config: SimulationConfig;
  runFrame(stepsPerFrame: number): Promise<FrameData>;
  /** Cached snapshot. Use refreshSnapshotAsync to update before reading at HUD cadence. */
  snapshot(): SimulationSnapshot;
  refreshSnapshotAsync(): Promise<void>;
  destroy(): void;
}

export function createCpuFrameRunner(
  config: SimulationConfig,
  initialSystem?: ParticleSystem,
): FrameRunner {
  const inner: SimulationRunner = createSimulationRunner(
    initialSystem === undefined ? { config } : { config, initialSystem },
  );
  const positions = inner.getSystem().positions;

  const dmCount = config.count;
  const gasCount = config.gasCount;

  return {
    mode: 'cpu',
    count: dmCount + gasCount,
    dmCount,
    gasCount,
    config,
    runFrame(stepsPerFrame): Promise<FrameData> {
      for (let i = 0; i < stepsPerFrame; i += 1) inner.step();
      inner.refreshDensities();
      const densities = inner.getDensities();
      let maxRho = 0;
      for (const rho of densities) if (rho > maxRho) maxRho = rho;
      return Promise.resolve({
        positions,
        densities,
        maxDensity: maxRho,
        gasInternalEnergy: inner.getGasInternalEnergy(),
        gasDensities: inner.getGasDensities(),
        stars: inner.getStars(),
      });
    },
    snapshot(): SimulationSnapshot {
      return inner.snapshot();
    },
    refreshSnapshotAsync(): Promise<void> {
      // CPU runner is always fresh — snapshot reads live state.
      return Promise.resolve();
    },
    destroy(): void {
      // Nothing GPU-side to free.
    },
  };
}

export function createGpuFrameRunner(
  ctx: GpuContext,
  config: SimulationConfig,
  externalInitialSystem?: ParticleSystem,
): FrameRunner {
  const initialSystem = externalInitialSystem ?? sphericalPerturbation(config);
  const gpu: GpuRunner = createGpuRunner(ctx, {
    initialSystem,
    params: {
      count: config.count,
      dt: config.dt,
      softening: config.softening,
      G: config.G,
      boxSize: config.cosmologicalMode ? 2 * config.boxHalfExtent : 0,
      driftScale: 1, // updated each frame from `aOfT(time)` if cosmological.
    },
  });

  // Shadow ParticleSystem fed with the latest GPU readback. Used for density
  // and snapshot calculations (pure functions over typed arrays).
  const shadow: ParticleSystem = createParticleSystem(config.count);
  shadow.masses.set(initialSystem.masses);
  shadow.positions.set(initialSystem.positions);
  shadow.velocities.set(initialSystem.velocities);

  const densities = new Float32Array(config.count);
  const kernel: DensityKernel = poly6Kernel(config.densityKernelRadius);
  const gridExtent = Math.max(2 * config.boxHalfExtent, 4);
  const cellsPerSide = Math.max(8, Math.ceil(gridExtent / config.densityKernelRadius));
  const grid: SpatialGrid = createSpatialGrid(shadow, {
    cellSize: gridExtent / cellsPerSide,
    cellsPerSide,
    origin: -gridExtent / 2,
  });

  let stepIndex = 0;
  let simTime = 0;
  let maxParticleDensity = 0;
  let frameCounter = 0;

  // Stage 4 halo finder + ignition for GPU mode (visual fix). The
  // simulation-runner runs the same logic on the CPU path; on GPU we
  // mirror it on the readback shadow so the user sees stars on
  // WebGPU-capable machines too. Cost: one FoF every K steps + a small
  // ignition pass over the resulting halos. Negligible at 4 k particles.
  const haloMeanSep =
    config.cosmologicalMode && config.count > 0
      ? Math.cbrt((2 * config.boxHalfExtent) ** 3 / config.count)
      : 0.1;
  const haloLinkingLength = config.haloLinkingFraction * haloMeanSep;
  const haloPeriodicSize = config.cosmologicalMode ? 2 * config.boxHalfExtent : 0;
  const haloCellSize = Math.max(haloLinkingLength, 1e-3);
  const haloCellsPerSide =
    haloPeriodicSize > 0
      ? Math.max(4, Math.floor(haloPeriodicSize / haloCellSize))
      : Math.max(8, Math.ceil(4 / haloCellSize));
  const haloGrid: SpatialGrid = createSpatialGrid(shadow, {
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

  const runHaloFinderAndIgnite = (zNowNum: number): void => {
    if (config.count === 0 || !config.cosmologicalMode) return;
    latestHalos = findHalos(shadow, haloGrid, {
      start: 0,
      count: config.count,
      linkingLength: haloLinkingLength,
      periodicBoxSize: haloPeriodicSize,
      minMembers: config.haloMinMembers,
      G: config.G,
    });
    const eligible: Halo[] = [];
    const eligibleIds: number[] = [];
    for (let i = 0; i < latestHalos.length; i += 1) {
      const halo = latestHalos[i];
      if (halo === undefined) continue;
      if (haloIsAlreadyLit(halo)) continue;
      eligible.push(halo);
      eligibleIds.push(i);
    }
    const result = igniteEligibleHalos(
      eligible,
      eligibleIds,
      redshift(zNowNum),
      new Set(),
      ignitionParams,
    );
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
  // Cosmic-time bookkeeping (Stage 2c1). Same convention as the CPU runner:
  // each physics step advances `ageInMyr` by `dtMyr` regardless of the
  // integrator's code-unit dt. Stage 2c2 unifies the two when comoving
  // leapfrog lands.
  const initialTimeMyr = computeInitialAge(config);
  let ageInMyr = initialTimeMyr;
  // Recompute density on the readback every Nth frame; the eye doesn't see
  // the difference but the CPU spatial-grid rebuild is the largest non-GPU
  // cost. At 60 fps target this is ~ 5 Hz, plenty for the colour-mapping window.
  const DENSITY_REFRESH_EVERY = 12;

  // Energy computation in GPU mode is sampled (full O(N²) potential is too
  // expensive at 10k for a live readout). Stage 1c ships kinetic + momentum
  // + density only; potential/virial/drift land later. See `EXPERIENCE.md` §10.
  const initialKinetic = sumKinetic(shadow);
  const a0 = aOfT(myr(initialTimeMyr), config.cosmology);
  let cachedSnapshot: SimulationSnapshot = {
    step: 0,
    time: 0,
    ageInMyr: initialTimeMyr,
    scaleFactor: asNumber(a0),
    redshift: asNumber(zOfA(a0)),
    kineticEnergy: initialKinetic,
    potentialEnergy: Number.NaN,
    totalEnergy: Number.NaN,
    initialTotalEnergy: Number.NaN,
    virialRatio: Number.NaN,
    centralDensity: centralDensity(shadow, config.densityProbeRadius),
    maxCentralDensity: centralDensity(shadow, config.densityProbeRadius),
    momentumMagnitude: momentumReport(shadow).magnitude,
    maxParticleDensity: 0,
    gasMassFraction: 0,
    gasMeanInternalEnergy: 0,
    gasMaxInternalEnergy: 0,
    gasMinInternalEnergy: 0,
    gasMinTemperatureK: 0,
    gasMaxH2Fraction: 0,
    gasMeanH2Fraction: 0,
    coolingMaxSubsteps: 0,
    coolingCappedThisStep: false,
    haloCount: 0,
    largestHaloMass: 0,
    largestHaloCentre: null,
    starCount: 0,
    firstIgnition: null,
  };

  // GPU mode doesn't run gas SPH yet (Stage 3c will add WGSL SPH kernels).
  // Expose gasCount = 0 even if config has gas — the SimulationCanvas will
  // route around the GPU runner if it wants gas, or accept DM-only on GPU.
  const dmCount = config.count;
  const emptyF32 = new Float32Array(0);

  return {
    mode: 'gpu',
    count: dmCount,
    dmCount,
    gasCount: 0,
    config,

    async runFrame(stepsPerFrame): Promise<FrameData> {
      if (config.cosmologicalMode) {
        const a = aOfT(myr(ageInMyr), config.cosmology);
        const aNum = asNumber(a);
        gpu.setDriftScale(1 / Math.max(aNum * aNum, 1e-12));
      }
      const positions = await gpu.runFrame(stepsPerFrame);
      shadow.positions.set(positions);
      stepIndex += stepsPerFrame;
      simTime += stepsPerFrame * config.dt;
      ageInMyr += stepsPerFrame * config.dtMyr;
      frameCounter += 1;

      if (frameCounter % DENSITY_REFRESH_EVERY === 0) {
        rebuildSpatialGrid(grid, shadow);
        computeDensities(shadow, grid, kernel, densities);
        let maxRho = 0;
        for (const rho of densities) if (rho > maxRho) maxRho = rho;
        if (maxRho > maxParticleDensity) maxParticleDensity = maxRho;
      }

      // Halo finder + ignition on the readback shadow. Same cadence as the
      // CPU runner (every K steps). At 4 k particles this is < 5 ms per
      // pass — well inside the per-frame budget.
      if (
        config.cosmologicalMode &&
        (lastHaloFinderStep === -1 ||
          stepIndex - lastHaloFinderStep >= config.haloFinderEveryKSteps)
      ) {
        const aNow = aOfT(myr(ageInMyr), config.cosmology);
        const zNow = asNumber(zOfA(aNow));
        runHaloFinderAndIgnite(zNow);
        lastHaloFinderStep = stepIndex;
      }

      return {
        positions,
        densities,
        maxDensity: maxParticleDensity,
        gasInternalEnergy: emptyF32,
        gasDensities: emptyF32,
        stars,
      };
    },

    snapshot(): SimulationSnapshot {
      return cachedSnapshot;
    },

    async refreshSnapshotAsync(): Promise<void> {
      const velocities = await gpu.readVelocities();
      shadow.velocities.set(velocities);
      const rho = centralDensity(shadow, config.densityProbeRadius);
      const a = aOfT(myr(ageInMyr), config.cosmology);
      cachedSnapshot = {
        step: stepIndex,
        time: simTime,
        ageInMyr,
        scaleFactor: asNumber(a),
        redshift: asNumber(zOfA(a)),
        kineticEnergy: sumKinetic(shadow),
        potentialEnergy: Number.NaN,
        totalEnergy: Number.NaN,
        initialTotalEnergy: Number.NaN,
        virialRatio: Number.NaN,
        centralDensity: rho,
        maxCentralDensity: Math.max(rho, cachedSnapshot.maxCentralDensity),
        momentumMagnitude: momentumReport(shadow).magnitude,
        maxParticleDensity,
        gasMassFraction: 0,
        gasMeanInternalEnergy: 0,
        gasMaxInternalEnergy: 0,
        gasMinInternalEnergy: 0,
        gasMinTemperatureK: 0,
        gasMaxH2Fraction: 0,
        gasMeanH2Fraction: 0,
        coolingMaxSubsteps: 0,
        coolingCappedThisStep: false,
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

    destroy(): void {
      gpu.destroy();
    },
  };
}

function computeInitialAge(config: SimulationConfig): number {
  const aInit = scaleFactor(1 / (1 + asNumber(config.zInit)));
  return asNumber(tOfA(aInit, config.cosmology));
}

function sumKinetic(ps: ParticleSystem): number {
  let T = 0;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const vx = ps.velocities[j] ?? 0;
    const vy = ps.velocities[j + 1] ?? 0;
    const vz = ps.velocities[j + 2] ?? 0;
    const m = ps.masses[i] ?? 0;
    T += 0.5 * m * (vx * vx + vy * vy + vz * vz);
  }
  return T;
}

// Re-used in cross-validation tests in a follow-up: same IC fed to a
// CPU runner via createSimulationRunner and a GPU runner via createGpuFrameRunner
// should produce positions that diverge < 1e-4 over 100 steps.
export { energyReport };
