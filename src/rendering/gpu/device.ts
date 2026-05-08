// WebGPU adapter + device init. Stage 1c.
//
// We request the strongest adapter available (`high-performance` power pref)
// because the simulation is the whole reason the user is here. We don't ask
// for any optional features — direct N² + leapfrog only need core compute.

export interface GpuContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
}

export async function initWebGpu(): Promise<GpuContext | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null;

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (adapter === null) return null;

  const device = await adapter.requestDevice();
  device.lost.then(
    (info) => {
      console.warn('[gpu] device lost:', info.reason, info.message);
    },
    () => undefined,
  );
  return { adapter, device, queue: device.queue };
}
