// Render + simulation loop. The simulation step is decoupled from the render
// step: we run K simulation substeps per frame so that visual time advances
// at a configurable rate independently of frame-rate jitter. This is the
// pattern we'll keep when WebGPU compute lands in Stage 1b.

import type { SceneHandle } from './scene';

export interface LoopController {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  setStepsPerFrame(n: number): void;
}

export interface LoopHooks {
  /** Run one physics step (called `stepsPerFrame` times each frame). */
  simulate(): void;
  /** Push the latest particle positions into the GPU buffers. */
  syncRender(): void;
  /** Optional per-frame callback for HUD updates. Throttled by the caller. */
  onFrame?: ((dtMs: number) => void) | undefined;
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

  const tick = (now: number): void => {
    if (!running) return;
    const dt = lastFrameTime === 0 ? 16.7 : now - lastFrameTime;
    lastFrameTime = now;

    for (let i = 0; i < stepsPerFrame; i += 1) {
      hooks.simulate();
    }
    hooks.syncRender();

    scene.controls.update();
    scene.renderer.render(scene.scene, scene.camera);

    hooks.onFrame?.(dt);

    raf = requestAnimationFrame(tick);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      lastFrameTime = 0;
      raf = requestAnimationFrame(tick);
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
