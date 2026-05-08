// WebGPU capability detection. Stage 1b only inspects support; Stage 1c will
// initialise a device and use it for the compute pipelines.

export type GpuStatus =
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'supported' };

export async function detectWebGpu(): Promise<GpuStatus> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { kind: 'unsupported', reason: 'WebGPU is not available in this browser.' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) {
      return {
        kind: 'unsupported',
        reason: 'Browser exposes WebGPU but no adapter is available.',
      };
    }
    return { kind: 'supported' };
  } catch (err) {
    return {
      kind: 'unsupported',
      reason: `WebGPU adapter request failed: ${String(err instanceof Error ? err.message : err)}`,
    };
  }
}
