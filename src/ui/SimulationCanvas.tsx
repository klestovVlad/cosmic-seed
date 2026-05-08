import { useEffect, useRef } from 'react';
import { createScene } from '@rendering/scene';
import { createBoxFrame } from '@rendering/box-frame';
import { createParticleCloud, type ParticleCloud } from '@rendering/particle-cloud';
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
  const out = zeldovichField(useGpu ? ZELDOVICH_PARAMS_GPU : ZELDOVICH_PARAMS_CPU);
  const ps = createParticleSystem(out.positions.length / 4);
  ps.positions.set(out.positions);
  // Start at rest in comoving — Zeldovich peculiar velocities are tiny at
  // z = 50 anyway, and zeroing them keeps the toy box stable while the
  // gravity field begins to cluster the displaced grid.
  ps.velocities.fill(0);
  ps.masses.set(out.masses);
  return ps;
}

export function SimulationCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      const cloud: ParticleCloud = createParticleCloud(runner.count, window.devicePixelRatio);
      scene.scene.add(cloud.object);
      const boxFrame = config.cosmologicalMode ? createBoxFrame(config.boxHalfExtent) : null;
      if (boxFrame !== null) scene.scene.add(boxFrame.object);

      const store = useSimulationStore.getState();
      store.setParticleCount(runner.count);
      store.setRunning(true);

      let frames = 0;
      let lastSampleAt = performance.now();
      let lastDensityRange = { min: 1e-3, max: 1.0 };
      let initialMaxDensity = 0;
      useSimulationStore.getState().resetDensitySamples();

      const loop = createLoop(
        scene,
        {
          async runFrame(stepsPerFrame): Promise<void> {
            const frame = await runner.runFrame(stepsPerFrame);
            cloud.syncPositions(frame.positions);
            cloud.syncDensities(frame.densities);
            if (frame.maxDensity > lastDensityRange.max) {
              const min = Math.max(1e-3, frame.maxDensity * 1e-2);
              cloud.setDensityRange(min, frame.maxDensity);
              lastDensityRange = { min, max: frame.maxDensity };
            }
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
        scene.resize(w, h, dpr);
        cloud.resize(dpr);
      };

      handleResize();
      window.addEventListener('resize', handleResize);
      loop.start();

      cleanup = (): void => {
        loop.stop();
        useSimulationStore.getState().setRunning(false);
        window.removeEventListener('resize', handleResize);
        cloud.dispose();
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
    <canvas
      ref={canvasRef}
      data-testid="simulation-canvas"
      className="absolute inset-0 z-0 block h-full w-full"
    />
  );
}
