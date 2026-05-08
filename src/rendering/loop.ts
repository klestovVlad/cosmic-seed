// Render + simulation loop. The simulation step can be sync (CPU runner) or
// async (GPU runner with mapAsync readback). Hook callbacks may return
// Promises; the loop awaits them before submitting the next RAF.

import type { SceneHandle } from './scene';

export interface LoopController {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  setStepsPerFrame(n: number): void;
}

export interface LoopHooks {
  /** Run K simulation steps and update render-side buffers. May be async. */
  runFrame(stepsPerFrame: number): void | Promise<void>;
  /** Optional per-frame callback for HUD updates. Throttled by the caller. */
  onFrame?: ((dtMs: number) => void | Promise<void>) | undefined;
  /** Optional sync callback fired right after each render — use it to update
   *  DOM overlays that mirror the camera (annotation pins, screen-space
   *  labels). Must be cheap; it runs on every frame. */
  onRender?: ((scene: SceneHandle) => void) | undefined;
}

export function createLoop(
  scene: SceneHandle,
  hooks: LoopHooks,
  initialStepsPerFrame = 4,
): LoopController {
  let stepsPerFrame = Math.max(0, Math.floor(initialStepsPerFrame));
  let raf = 0;
  let running = false;
  let lastFrameTime = 0;

  const tick = async (now: number): Promise<void> => {
    if (!running) return;
    const dt = lastFrameTime === 0 ? 16.7 : now - lastFrameTime;
    lastFrameTime = now;

    await hooks.runFrame(stepsPerFrame);

    scene.controls.update();
    scene.composer.render();
    hooks.onRender?.(scene);

    await hooks.onFrame?.(dt);

    // Re-check after the awaited hook — `running` could have flipped during
    // the await (e.g. component unmount calls stop()).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (running) {
      raf = requestAnimationFrame((t) => {
        void tick(t);
      });
    }
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      lastFrameTime = 0;
      raf = requestAnimationFrame((t) => {
        void tick(t);
      });
    },
    stop(): void {
      running = false;
      if (raf !== 0) cancelAnimationFrame(raf);
    },
    isRunning(): boolean {
      return running;
    },
    setStepsPerFrame(n: number): void {
      stepsPerFrame = Math.max(0, Math.floor(n));
    },
  };
}
