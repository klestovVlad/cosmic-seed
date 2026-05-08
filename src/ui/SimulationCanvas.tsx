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

const HUD_REFRESH_HZ = 10;
const HUD_REFRESH_INTERVAL_MS = 1000 / HUD_REFRESH_HZ;

// Default GPU count is the upper bound where the compute kernel still
// leaves the browser compositor enough GPU time to put our pixels on
// screen. Stage 1 brief asked for 10 k; in practice that starves the
// compositor on most laptop GPUs (HUD reports fps but the screen
// updates at 1–2 Hz). 5 k feels comfortable across the devices tested.
// Stage 7 lifts this with a Barnes–Hut tree (N log N) and/or
// Three.js WebGPURenderer (shared device, no context switch).
const GPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: 5000,
  // Mean inter-particle separation at 5 k in a unit sphere ≈ 0.094.
  softening: 0.045,
  densityKernelRadius: 0.14,
};

const CPU_CONFIG: SimulationConfig = DEFAULT_CONFIG;

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
      const runner: FrameRunner = useGpu
        ? createGpuFrameRunner(gpuCtx, config)
        : createCpuFrameRunner(config);
      console.warn(
        `[sim] mode=${runner.mode} particles=${String(runner.count)} dt=${String(config.dt)} softening=${String(config.softening)}`,
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
