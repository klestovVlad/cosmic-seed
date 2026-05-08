import { useUiStore } from '@state/uiStore';

export function CompatibilityBanner(): React.JSX.Element | null {
  const gpuStatus = useUiStore((s) => s.gpuStatus);

  if (gpuStatus.kind !== 'unsupported') return null;

  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 z-30 max-w-md -translate-x-1/2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 backdrop-blur-sm">
      <p className="font-mono text-[11px] text-amber-100">
        <span className="text-amber-300">heads-up</span> · running on the CPU fallback. With WebGPU
        this jumps from <span className="text-amber-300">1.5k</span> to{' '}
        <span className="text-amber-300">10k</span> particles at 60 fps.
      </p>
      <p className="mt-1 font-mono text-[10px] text-amber-200/70">{gpuStatus.reason}</p>
    </div>
  );
}
