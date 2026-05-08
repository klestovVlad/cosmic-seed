import { useEffect, useRef } from 'react';
import { createScene } from '@rendering/scene';
import { createParticleCloud } from '@rendering/particle-cloud';
import { createLoop } from '@rendering/loop';
import { useSimulationStore } from '@state/simulationStore';
import { createSimulationRunner, DEFAULT_CONFIG } from '@state/controllers/simulation-runner';

const HUD_REFRESH_HZ = 10;
const HUD_REFRESH_INTERVAL_MS = 1000 / HUD_REFRESH_HZ;

export function SimulationCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const store = useSimulationStore.getState();
    const scene = createScene(canvas);
    const runner = createSimulationRunner(DEFAULT_CONFIG);
    const cloud = createParticleCloud(runner.config.count, window.devicePixelRatio);
    scene.scene.add(cloud.object);

    store.setParticleCount(runner.config.count);

    // Initial paint before any simulation step.
    cloud.syncFrom(runner.getSystem());

    let frames = 0;
    let stepsThisInterval = 0;
    let lastSampleAt = performance.now();

    const loop = createLoop(
      scene,
      {
        simulate: () => {
          runner.step();
          stepsThisInterval += 1;
        },
        syncRender: () => {
          cloud.syncFrom(runner.getSystem());
        },
        onFrame: () => {
          frames += 1;
          const now = performance.now();
          const dt = now - lastSampleAt;
          if (dt >= HUD_REFRESH_INTERVAL_MS) {
            const fps = (frames * 1000) / dt;
            const sps = (stepsThisInterval * 1000) / dt;
            const snap = runner.snapshot();
            useSimulationStore.getState().setDiagnostics({
              ...snap,
              fps,
              stepsPerSecond: sps,
            });
            frames = 0;
            stepsThisInterval = 0;
            lastSampleAt = now;
          }
        },
      },
      4,
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
    store.setRunning(true);

    return () => {
      loop.stop();
      useSimulationStore.getState().setRunning(false);
      window.removeEventListener('resize', handleResize);
      cloud.dispose();
      scene.dispose();
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
