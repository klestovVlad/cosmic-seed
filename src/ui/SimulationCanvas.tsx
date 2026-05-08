import { useEffect, useRef } from 'react';
import { createScene } from '@rendering/scene';
import { createBoxFrame } from '@rendering/box-frame';
import { createGasCloud, type GasCloud } from '@rendering/gas-cloud';
import { createParticleCloud, type ParticleCloud } from '@rendering/particle-cloud';
import { createStarCloud, type StarCloud } from '@rendering/star-cloud';
import { createLoop } from '@rendering/loop';
import { initWebGpu } from '@rendering/gpu/device';
import { useSimulationStore } from '@state/simulationStore';
import { useUiStore } from '@state/uiStore';
import {
  createCpuFrameRunner,
  createGpuFrameRunner,
  type FrameRunner,
} from '@state/controllers/frame-runner';
import { DEFAULT_CONFIG, type SimulationConfig } from '@state/controllers/simulation-runner';
import {
  createParticleSystem,
  type ParticleSystem,
  PLANCK_2018,
  PLANCK_2018_PS,
  redshift,
  zeldovichField,
} from '@physics/index';
import { AnnotationPins, type AnnotationPinsHandle } from './AnnotationPins';

const HUD_REFRESH_HZ = 10;
const HUD_REFRESH_INTERVAL_MS = 1000 / HUD_REFRESH_HZ;

// Stage 2c2 — cosmological mode by default: Zeldovich IC, periodic
// min-image gravity, comoving leapfrog with 1/a² drift scale.
// User-experience tuning (post 2c3 polish):
//   * grid must be a power of two (Zeldovich uses radix-2 FFT). 16³ = 4096
//     fits comfortably under the compositor-starvation threshold; the
//     in-between 8000 → 32768 jump (next power of 2) is too aggressive
//     until Stage 3c moves the SPH pass to the GPU.
//   * lower σ_8 so the field stays in a visually-rewarding linear → mildly
//     nonlinear regime instead of collapsing to a single dominant halo.
//   * tighter density kernel + smaller point sprites so individual halos
//     are crisp instead of merging into puffs.
//   * slower dtMyr so the eye can follow the structure-formation arc.
const GPU_GRID = 16;
const GPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: GPU_GRID ** 3,
  cosmologicalMode: true,
  boxHalfExtent: 0.5,
  softening: 0.018,
  densityKernelRadius: 0.06,
  dt: 1.2e-3,
  dtMyr: 0.2,
  zInit: redshift(50),
};

const CPU_GRID = 8;
// CPU mode runs Stage-3b two-species hydrodynamics: same Zeldovich field
// gives DM at the grid cell centres and gas offset by half-cell to avoid
// the SPH pairing instability. GPU mode stays DM-only until Stage 3c
// adds WGSL SPH compute kernels.
const CPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: CPU_GRID ** 3,
  cosmologicalMode: true,
  boxHalfExtent: 0.5,
  softening: 0.05,
  densityKernelRadius: 0.16,
  dt: 1.2e-3,
  dtMyr: 0.2,
  zInit: redshift(50),
  gasCount: CPU_GRID ** 3,
  // u₀ small but non-zero so initial pressure exists (prevents immediate
  // gas collapse before adiabatic compression wakes things up).
  gasInitialEnergy: 5e-4,
  gasSmoothingLength: 0.18,
};

const TAMED_PS = { ...PLANCK_2018_PS, sigma8: 0.5 };

// Seed picked deliberately: with σ_8 = 0.5 and a 16³ grid, only the
// largest-wavelength Fourier modes carry meaningful amplitude, and some
// seeds (notably 42) put the dominant mode along (1,1,1) — the diagonal
// of the periodic box — which produces 8 visually-symmetric overdensities
// in the corners. Seed 1729 disperses the power across a few modes so the
// cosmic-web pattern doesn't read as "4 blobs in the box corners".
const ZELDOVICH_PARAMS_GPU = {
  cosmology: PLANCK_2018,
  powerSpectrum: TAMED_PS,
  seed: 1729,
  gridN: GPU_GRID,
  boxSizeMpcH: 1.0,
  zInit: redshift(50),
};

const ZELDOVICH_PARAMS_CPU = {
  ...ZELDOVICH_PARAMS_GPU,
  gridN: CPU_GRID,
};

function buildZeldovichInitialSystem(useGpu: boolean): ParticleSystem {
  const config = useGpu ? GPU_CONFIG : CPU_CONFIG;
  const zParams = useGpu ? ZELDOVICH_PARAMS_GPU : ZELDOVICH_PARAMS_CPU;
  const dmIc = zeldovichField(zParams);
  const dmCount = dmIc.positions.length / 4;

  if (config.gasCount === 0) {
    // DM-only path (GPU mode for Stage 3b).
    const ps = createParticleSystem(dmCount);
    ps.positions.set(dmIc.positions);
    ps.velocities.fill(0);
    ps.masses.set(dmIc.masses);
    return ps;
  }

  // Two-species: DM at grid cell centres, gas offset by half-cell.
  const gridN = zParams.gridN;
  const halfCell = zParams.boxSizeMpcH / gridN / 2;
  const gasIc = zeldovichField(zParams);
  const gasCount = gasIc.positions.length / 4;
  const total = dmCount + gasCount;
  const ps = createParticleSystem(total);

  // DM particles. Mass scaled so DM contributes ~ 0.85 of total (Ω_DM/Ω_m).
  const dmMassFactor = 0.85;
  const gasMassFactor = 0.15;
  for (let i = 0; i < dmCount; i += 1) {
    const idx = i * 4;
    ps.positions[idx] = dmIc.positions[idx] ?? 0;
    ps.positions[idx + 1] = dmIc.positions[idx + 1] ?? 0;
    ps.positions[idx + 2] = dmIc.positions[idx + 2] ?? 0;
    ps.masses[i] = (dmIc.masses[i] ?? 0) * dmMassFactor;
  }

  // Gas particles, offset by + halfCell on each axis. Wrap into the box.
  const halfL = zParams.boxSizeMpcH / 2;
  const L = zParams.boxSizeMpcH;
  for (let g = 0; g < gasCount; g += 1) {
    const src = g * 4;
    const dst = (dmCount + g) * 4;
    let x = (gasIc.positions[src] ?? 0) + halfCell;
    let y = (gasIc.positions[src + 1] ?? 0) + halfCell;
    let z = (gasIc.positions[src + 2] ?? 0) + halfCell;
    if (x > halfL) x -= L;
    if (y > halfL) y -= L;
    if (z > halfL) z -= L;
    ps.positions[dst] = x;
    ps.positions[dst + 1] = y;
    ps.positions[dst + 2] = z;
    ps.masses[dmCount + g] = (gasIc.masses[g] ?? 0) * gasMassFactor;
  }

  // Velocities zero everywhere — Zeldovich pec velocities at z=50 are noise.
  return ps;
}

export function SimulationCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinsRef = useRef<AnnotationPinsHandle | null>(null);
  // Pinned to a ref so the loop closure (created once on mount) can read
  // the latest canvas size without re-creating the loop on resize.
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 1, height: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const lifecycle = { cancelled: false };
    let cleanup: (() => void) | null = null;

    void (async (): Promise<void> => {
      const gpuCtx = await initWebGpu();
      if (lifecycle.cancelled) {
        gpuCtx?.destroy();
        return;
      }

      const useGpu = gpuCtx !== null;
      const config = useGpu ? GPU_CONFIG : CPU_CONFIG;
      const initialSystem = buildZeldovichInitialSystem(useGpu);
      const runner: FrameRunner = useGpu
        ? createGpuFrameRunner(gpuCtx, config, initialSystem)
        : createCpuFrameRunner(config, initialSystem);
      console.warn(
        `[sim] mode=${runner.mode} particles=${String(runner.count)} ic=zeldovich z_init=${String(config.zInit)}`,
      );

      useUiStore.getState().setGpuStatus(
        useGpu
          ? { kind: 'supported' }
          : {
              kind: 'unsupported',
              reason: 'WebGPU adapter not available — running on the CPU fallback.',
            },
      );

      const scene = createScene(canvas);
      const dmCloud: ParticleCloud = createParticleCloud(runner.dmCount, window.devicePixelRatio);
      scene.scene.add(dmCloud.object);
      const gasCloud: GasCloud | null =
        runner.gasCount > 0 ? createGasCloud(runner.gasCount, window.devicePixelRatio) : null;
      if (gasCloud !== null) scene.scene.add(gasCloud.object);
      // Stage 4: star cloud sized for far more capacity than we'll use; ignited
      // halos appear as bright white points at their centres.
      const starCloud: StarCloud | null = config.cosmologicalMode
        ? createStarCloud(256, window.devicePixelRatio)
        : null;
      if (starCloud !== null) scene.scene.add(starCloud.object);
      const boxFrame = config.cosmologicalMode ? createBoxFrame(config.boxHalfExtent) : null;
      if (boxFrame !== null) scene.scene.add(boxFrame.object);

      const store = useSimulationStore.getState();
      store.setParticleCount(runner.count);
      store.setRunning(true);

      let frames = 0;
      let lastSampleAt = performance.now();
      let lastDensityRange = { min: 1e-3, max: 1.0 };
      let lastTempRange = { min: 1e-4, max: 1e-3 };
      let initialMaxDensity = 0;
      useSimulationStore.getState().resetDensitySamples();

      const dmPositionsBytes = runner.dmCount * 4;
      const gasPositionsByteStart = dmPositionsBytes;
      const gasPositionsByteEnd = gasPositionsByteStart + runner.gasCount * 4;

      const loop = createLoop(
        scene,
        {
          async runFrame(stepsPerFrame): Promise<void> {
            const frame = await runner.runFrame(stepsPerFrame);
            // DM cloud: first dmCount particles + their density buffer.
            const dmPositions = frame.positions.subarray(0, dmPositionsBytes);
            dmCloud.syncPositions(dmPositions);
            dmCloud.syncDensities(frame.densities);
            if (frame.maxDensity > lastDensityRange.max) {
              const min = Math.max(1e-3, frame.maxDensity * 1e-2);
              dmCloud.setDensityRange(min, frame.maxDensity);
              lastDensityRange = { min, max: frame.maxDensity };
            }
            if (gasCloud !== null && runner.gasCount > 0) {
              const gasPositions = frame.positions.subarray(
                gasPositionsByteStart,
                gasPositionsByteEnd,
              );
              gasCloud.syncPositions(gasPositions);
              gasCloud.syncTemperatures(frame.gasInternalEnergy);
              // Track temperature range for the colormap window.
              let maxT = 0;
              for (const t of frame.gasInternalEnergy) if (t > maxT) maxT = t;
              if (maxT > lastTempRange.max) {
                const min = Math.max(1e-5, maxT * 5e-2);
                gasCloud.setTemperatureRange(min, maxT);
                lastTempRange = { min, max: maxT };
              }
            }
            if (starCloud !== null) {
              starCloud.syncStars(frame.stars);
            }
          },
          onRender(s): void {
            const size = canvasSizeRef.current;
            pinsRef.current?.updatePinScreenPositions(s.camera, size.width, size.height);
          },
          async onFrame(): Promise<void> {
            frames += 1;
            const now = performance.now();
            const elapsed = now - lastSampleAt;
            if (elapsed >= HUD_REFRESH_INTERVAL_MS) {
              await runner.refreshSnapshotAsync();
              const snap = runner.snapshot();
              const fps = (frames * 1000) / elapsed;
              const store = useSimulationStore.getState();
              store.setDiagnostics({
                ...snap,
                fps,
                stepsPerSecond: (snap.step * 1000) / Math.max(now, 1),
              });
              if (initialMaxDensity === 0 && snap.maxParticleDensity > 0) {
                initialMaxDensity = snap.maxParticleDensity;
              }
              if (initialMaxDensity > 0 && snap.scaleFactor > 0) {
                store.pushDensitySample({
                  a: snap.scaleFactor,
                  delta: snap.maxParticleDensity / initialMaxDensity,
                });
              }
              frames = 0;
              lastSampleAt = now;
            }
          },
        },
        // 1 GPU step per frame — keeps the compute kernel short so the
        // compositor isn't starved of GPU time. CPU path runs more steps
        // per frame because each is much shorter at 1.5 k particles.
        useGpu ? 1 : 4,
      );

      const handleResize = (): void => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const dpr = window.devicePixelRatio;
        canvasSizeRef.current = { width: w, height: h };
        scene.resize(w, h, dpr);
        dmCloud.resize(dpr);
        gasCloud?.resize(dpr);
        starCloud?.resize(dpr);
      };

      handleResize();
      window.addEventListener('resize', handleResize);
      loop.start();

      cleanup = (): void => {
        loop.stop();
        useSimulationStore.getState().setRunning(false);
        window.removeEventListener('resize', handleResize);
        dmCloud.dispose();
        gasCloud?.dispose();
        starCloud?.dispose();
        boxFrame?.dispose();
        scene.dispose();
        runner.destroy();
        gpuCtx?.destroy();
      };
    })().catch((err: unknown) => {
      console.error('[sim-canvas] init failed', err);
    });

    return () => {
      lifecycle.cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="simulation-canvas"
        className="absolute inset-0 z-0 block h-full w-full"
      />
      <AnnotationPins ref={pinsRef} unitMassPerMsun={GPU_CONFIG.unitMassPerMsun} />
    </>
  );
}
