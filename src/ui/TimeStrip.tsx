import { useUiStore } from '@state/uiStore';
import { useSimulationStore } from '@state/simulationStore';
import { asNumber, PLANCK_2018, scaleFactor, speedOfTimeReadout, tOfA } from '@physics/index';

// Stage 2c1 — see EXPERIENCE.md §2 (time strip + speed-of-time readout).
// Reads cosmic time from the simulation runner via the store, no longer
// driven by the wall clock. Stage 2c2 will replace the integrator's
// code-unit dt with a Myr-aware comoving leapfrog so the cursor and the
// physics share the same clock.

interface TimeRange {
  readonly z_init: number;
  readonly z_end: number;
}

const DEFAULT_RANGE: TimeRange = { z_init: 100, z_end: 6 };

const T_INIT_MYR = asNumber(tOfA(scaleFactor(1 / (1 + DEFAULT_RANGE.z_init)), PLANCK_2018));
const T_END_MYR = asNumber(tOfA(scaleFactor(1 / (1 + DEFAULT_RANGE.z_end)), PLANCK_2018));

function fmtMyr(myrVal: number): string {
  if (myrVal < 1) return `${(myrVal * 1000).toFixed(0)} kyr`;
  if (myrVal < 1000) return `${myrVal.toFixed(0)} Myr`;
  return `${(myrVal / 1000).toFixed(2)} Gyr`;
}

export function TimeStrip(): React.JSX.Element {
  const explained = useUiStore((s) => !s.expertMode);
  const ageInMyr = useSimulationStore((s) => s.diagnostics.ageInMyr);
  const z = useSimulationStore((s) => s.diagnostics.redshift);
  const stepsPerSecond = useSimulationStore((s) => s.diagnostics.stepsPerSecond);
  const dtMyr = useSimulationStore((s) => s.diagnostics.dtMyr);

  // True wall-clock advance rate: stepsPerSecond × Myr-per-step.
  // Replaces the old hard-coded `0.6` assumption that lied loudly when
  // SimulationCanvas's GPU_CONFIG used a different dtMyr.
  const myrPerSecond = stepsPerSecond * dtMyr;

  const tNow = ageInMyr === 0 ? T_INIT_MYR : ageInMyr;
  const progress = Math.min(
    1,
    Math.max(0, (tNow - T_INIT_MYR) / Math.max(1e-9, T_END_MYR - T_INIT_MYR)),
  );

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
          z = {DEFAULT_RANGE.z_init} · {fmtMyr(T_INIT_MYR)}
        </span>
        <span>
          z = {DEFAULT_RANGE.z_end} · {fmtMyr(T_END_MYR)}
        </span>
      </div>
    </div>
  );
}
