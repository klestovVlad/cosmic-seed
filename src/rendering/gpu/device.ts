// WebGPU adapter + device init. Stage 1c.
//
// We request the strongest adapter available (`high-performance` power pref)
// because the simulation is the whole reason the user is here. We don't ask
// for any optional features — direct N² + leapfrog only need core compute.

export interface GpuContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  /** Marks the impending destroy as intentional so the lost handler stays quiet. */
  destroy(): void;
}

export async function initWebGpu(): Promise<GpuContext | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null;

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (adapter === null) return null;

  const device = await adapter.requestDevice();

  // Distinguish "we destroyed it" (expected) from a genuine device loss
  // (browser GPU process restart, OS reset, …).
  let intentional = false;
  device.lost.then(
    (info) => {
      if (intentional) return;
      console.warn('[gpu] device lost unexpectedly:', info.reason, info.message);
    },
    () => undefined,
  );

  return {
    adapter,
    device,
    queue: device.queue,
    destroy(): void {
      intentional = true;
      device.destroy();
    },
  };
}
