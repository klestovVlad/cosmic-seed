import { useUiStore } from '@state/uiStore';
import { useSimulationStore } from '@state/simulationStore';
import { useEffect, useMemo, useState } from 'react';
import {
  aOfT,
  asNumber,
  myr,
  PLANCK_2018,
  scaleFactor,
  speedOfTimeReadout,
  tOfA,
  zOfA,
} from '@physics/index';

// Stage 2a — see EXPERIENCE.md §2 (time strip + speed-of-time readout)
// and DECISIONS.md "Stage 2 split into 2a / 2b / 2c". Until 2b lands the
// underlying simulation runs in code units, so the readouts here are tied
// to a *display redshift cursor* that moves at the configured sim speed.
// When the comoving IC arrives in 2b, this component will switch to read
// the runner's true cosmological time without any other UI change.

interface TimeRange {
  readonly z_init: number;
  readonly z_end: number;
}

const DEFAULT_RANGE: TimeRange = { z_init: 100, z_end: 6 };

function fmtMyr(myrVal: number): string {
  if (myrVal < 1) return `${(myrVal * 1000).toFixed(0)} kyr`;
  if (myrVal < 1000) return `${myrVal.toFixed(0)} Myr`;
  return `${(myrVal / 1000).toFixed(2)} Gyr`;
}

export function TimeStrip(): React.JSX.Element {
  const explained = useUiStore((s) => !s.expertMode);

  // The "display cursor" — wall-clock-driven for now; will be replaced by
  // the sim runner's actual t/a in Stage 2b.
  const t_init = useMemo(
    () => asNumber(tOfA(scaleFactor(1 / (1 + DEFAULT_RANGE.z_init)), PLANCK_2018)),
    [],
  );
  const t_end = useMemo(
    () => asNumber(tOfA(scaleFactor(1 / (1 + DEFAULT_RANGE.z_end)), PLANCK_2018)),
    [],
  );

  // Speed: how many sim-Myr pass per real-second. We pick a default that
  // crosses z=100 → z=6 in roughly two minutes for the demo. The actual
  // sim is in code units; the cursor is decorative until 2b.
  const myrPerSecond = (t_end - t_init) / 120;

  const isRunning = useSimulationStore((s) => s.isRunning);
  const [tNow, setTNow] = useState(t_init);

  useEffect(() => {
    if (!isRunning) return;
    let raf = 0;
    let lastWall = performance.now();
    const tick = (): void => {
      const now = performance.now();
      const dt = (now - lastWall) / 1000;
      lastWall = now;
      setTNow((prev) => {
        const next = prev + dt * myrPerSecond;
        return next >= t_end ? t_end : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isRunning, myrPerSecond, t_end]);

  const a = aOfT(myr(tNow), PLANCK_2018);
  const z = asNumber(zOfA(a));
  const progress = Math.min(1, Math.max(0, (tNow - t_init) / Math.max(1e-9, t_end - t_init)));

  const labelZ = explained ? 'redshift' : 'z';
  const labelT = explained ? 'age of universe' : 't';

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-20 flex w-[min(640px,calc(100vw-1rem))] -translate-x-1/2 flex-col gap-1.5 rounded-md border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
        <span className="text-(--color-ink-3) tracking-wider uppercase">cosmic seed</span>
        <span className="text-(--color-ink-3)">
          <span className="text-(--color-ink-2)">{labelZ}</span>{' '}
          <span className="text-(--color-ink-1)">{z.toFixed(1)}</span>
        </span>
        <span className="text-(--color-ink-3)">
          <span className="text-(--color-ink-2)">{labelT}</span>{' '}
          <span className="text-(--color-ink-1)">{fmtMyr(tNow)}</span>
        </span>
        <span className="text-(--color-ink-3)" title="Sim time per real-time second">
          {speedOfTimeReadout(myrPerSecond)}
        </span>
      </div>
      <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-(--color-dm-mid) to-(--color-dm-high)"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] text-(--color-ink-3) tracking-wider">
        <span>
          z = {DEFAULT_RANGE.z_init} · {fmtMyr(t_init)}
        </span>
        <span>
          z = {DEFAULT_RANGE.z_end} · {fmtMyr(t_end)}
        </span>
      </div>
    </div>
  );
}
