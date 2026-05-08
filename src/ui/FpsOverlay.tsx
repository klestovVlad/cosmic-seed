import { useEffect, useRef, useState } from 'react';

const HUD_REFRESH_HZ = 10;
const HUD_REFRESH_INTERVAL_MS = 1000 / HUD_REFRESH_HZ;

export function FpsOverlay(): React.JSX.Element {
  const [fps, setFps] = useState<number | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let lastSampleAt = performance.now();
    let totalFrames = 0;
    let cancelled = false;

    const tick = (): void => {
      if (cancelled) return;
      frames += 1;
      totalFrames += 1;
      const now = performance.now();
      const dt = now - lastSampleAt;
      if (dt >= HUD_REFRESH_INTERVAL_MS) {
        setFps((frames * 1000) / dt);
        setFrameCount(totalFrames);
        frames = 0;
        lastSampleAt = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      data-testid="fps-overlay"
      className="pointer-events-none fixed top-3 right-3 z-20 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-right font-mono text-[11px] leading-tight text-(--color-ink-2) backdrop-blur-sm"
    >
      <div>
        <span className="text-(--color-ink-3)">fps</span>{' '}
        <span data-testid="fps-value" className="text-(--color-ink-1)">
          {fps === null ? '—' : fps.toFixed(1)}
        </span>
      </div>
      <div>
        <span className="text-(--color-ink-3)">frames</span>{' '}
        <span data-testid="fps-frames" className="text-(--color-ink-1)">
          {frameCount}
        </span>
      </div>
    </div>
  );
}
