import { useEffect, useRef } from 'react';
import { createScene } from '@rendering/scene';
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
// min-image gravity, comoving leapfrog with 1/a² drift scale. Particle
// count is the cube of the Zeldovich grid resolution; we pick 16 → 4096
// for GPU and 8 → 512 for CPU.
const GPU_GRID = 16;
const GPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: GPU_GRID ** 3,
  cosmologicalMode: true,
  // Box size 1 in code units; particles centred on cells of L/N. Mean
  // inter-particle separation = L/N = 1/16 = 0.0625.
  boxHalfExtent: 0.5,
  softening: 0.025,
  densityKernelRadius: 0.1,
  // Slow the integrator down a bit so the cosmic-web evolution is visible
  // before particles fly across the box.
  dt: 1.5e-3,
  dtMyr: 0.4,
  zInit: redshift(50),
};

const CPU_GRID = 8;
const CPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: CPU_GRID ** 3,
  cosmologicalMode: true,
  boxHalfExtent: 0.5,
  softening: 0.05,
  densityKernelRadius: 0.18,
  dt: 1.5e-3,
  dtMyr: 0.4,
  zInit: redshift(50),
};

const ZELDOVICH_PARAMS_GPU = {
  cosmology: PLANCK_2018,
  powerSpectrum: PLANCK_2018_PS,
  seed: 42,
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

      const store = useSimulationStore.getState();
      store.setParticleCount(runner.count);
      store.setRunning(true);

      let frames = 0;
      let lastSampleAt = performance.now();
      let lastDensityRange = { min: 1e-3, max: 1.0 };

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
              useSimulationStore.getState().setDiagnostics({
                ...snap,
                fps,
                stepsPerSecond: (snap.step * 1000) / Math.max(now, 1),
              });
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
