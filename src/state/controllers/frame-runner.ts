// Frame runner: the unified async interface the render loop talks to.
// Hides whether the underlying simulation is CPU-only or GPU-accelerated.
//
// CPU implementation just wraps the existing synchronous SimulationRunner.
// GPU implementation queues a frame's worth of compute on a WebGPU device,
// reads positions back, and computes density on CPU from the readback.

import {
  centralDensity,
  computeDensities,
  createParticleSystem,
  createSpatialGrid,
  type DensityKernel,
  energyReport,
  momentumReport,
  type ParticleSystem,
  poly6Kernel,
  rebuildSpatialGrid,
  sphericalPerturbation,
  type SpatialGrid,
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
  /** count × 4 (xyz + pad) — same layout as ParticleSystem.positions. */
  readonly positions: Float32Array;
  /** count — per-particle smoothed density. */
  readonly densities: Float32Array;
  readonly maxDensity: number;
}

export interface FrameRunner {
  readonly mode: 'cpu' | 'gpu';
  readonly count: number;
  readonly config: SimulationConfig;
  runFrame(stepsPerFrame: number): Promise<FrameData>;
  /** Cached snapshot. Use refreshSnapshotAsync to update before reading at HUD cadence. */
  snapshot(): SimulationSnapshot;
  refreshSnapshotAsync(): Promise<void>;
  destroy(): void;
}

export function createCpuFrameRunner(config: SimulationConfig): FrameRunner {
  const inner: SimulationRunner = createSimulationRunner(config);
  const positions = inner.getSystem().positions;

  return {
    mode: 'cpu',
    count: config.count,
    config,
    runFrame(stepsPerFrame): Promise<FrameData> {
      for (let i = 0; i < stepsPerFrame; i += 1) inner.step();
      inner.refreshDensities();
      const densities = inner.getDensities();
      let maxRho = 0;
      for (const rho of densities) if (rho > maxRho) maxRho = rho;
      return Promise.resolve({ positions, densities, maxDensity: maxRho });
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

export function createGpuFrameRunner(ctx: GpuContext, config: SimulationConfig): FrameRunner {
  const initialSystem = sphericalPerturbation(config);
  const gpu: GpuRunner = createGpuRunner(ctx, {
    initialSystem,
    params: {
      count: config.count,
      dt: config.dt,
      softening: config.softening,
      G: config.G,
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

  // Energy computation in GPU mode is sampled (full O(N²) potential is too
  // expensive at 10k for a live readout). Stage 1c ships kinetic + momentum
  // + density only; potential/virial/drift land later. See `EXPERIENCE.md` §10.
  const initialKinetic = sumKinetic(shadow);
  let cachedSnapshot: SimulationSnapshot = {
    step: 0,
    time: 0,
    kineticEnergy: initialKinetic,
    potentialEnergy: Number.NaN,
    totalEnergy: Number.NaN,
    initialTotalEnergy: Number.NaN,
    virialRatio: Number.NaN,
    centralDensity: centralDensity(shadow, config.densityProbeRadius),
    maxCentralDensity: centralDensity(shadow, config.densityProbeRadius),
    momentumMagnitude: momentumReport(shadow).magnitude,
    maxParticleDensity: 0,
  };

  return {
    mode: 'gpu',
    count: config.count,
    config,

    async runFrame(stepsPerFrame): Promise<FrameData> {
      const positions = await gpu.runFrame(stepsPerFrame);
      shadow.positions.set(positions);
      stepIndex += stepsPerFrame;
      simTime += stepsPerFrame * config.dt;

      rebuildSpatialGrid(grid, shadow);
      computeDensities(shadow, grid, kernel, densities);
      let maxRho = 0;
      for (const rho of densities) if (rho > maxRho) maxRho = rho;
      if (maxRho > maxParticleDensity) maxParticleDensity = maxRho;
      return { positions, densities, maxDensity: maxRho };
    },

    snapshot(): SimulationSnapshot {
      return cachedSnapshot;
    },

    async refreshSnapshotAsync(): Promise<void> {
      const velocities = await gpu.readVelocities();
      shadow.velocities.set(velocities);
      const rho = centralDensity(shadow, config.densityProbeRadius);
      cachedSnapshot = {
        step: stepIndex,
        time: simTime,
        kineticEnergy: sumKinetic(shadow),
        potentialEnergy: Number.NaN,
        totalEnergy: Number.NaN,
        initialTotalEnergy: Number.NaN,
        virialRatio: Number.NaN,
        centralDensity: rho,
        maxCentralDensity: Math.max(rho, cachedSnapshot.maxCentralDensity),
        momentumMagnitude: momentumReport(shadow).magnitude,
        maxParticleDensity,
      };
    },

    destroy(): void {
      gpu.destroy();
    },
  };
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
