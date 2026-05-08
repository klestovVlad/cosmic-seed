import { MLY_PER_MPC } from '@physics/index';
import { useUiStore } from '@state/uiStore';

// Stage 2a — see EXPERIENCE.md §2.
//
// The scale bar tells the user the physical extent of the box in both
// professional units (Mpc) and a plain-language anchor (millions of light
// years). Until Stage 2b's comoving IC lands the underlying simulation is
// in code units, so the bar shows a *hypothetical* box length — the value
// the cosmological IC will be configured with. Once 2b lands, the bar
// reads the runner's actual `boxHalfExtent` parameter.

interface ScaleBarProps {
  /** Box co-moving size, in Mpc. Default 1 Mpc per the brief. */
  readonly mpc?: number;
}

function fmtMpc(mpcVal: number): string {
  if (mpcVal < 1) return `${(mpcVal * 1000).toFixed(0)} kpc`;
  if (mpcVal < 1000) return `${mpcVal.toFixed(2)} Mpc`;
  return `${(mpcVal / 1000).toFixed(2)} Gpc`;
}

function fmtLy(mpcVal: number): string {
  const ly = mpcVal * MLY_PER_MPC;
  if (ly < 1) return `${(ly * 1000).toFixed(0)} kly`;
  if (ly < 1000) return `${ly.toFixed(2)} Mly`;
  return `${(ly / 1000).toFixed(2)} Gly`;
}

export function ScaleBar({ mpc = 1 }: ScaleBarProps): React.JSX.Element {
  const explained = useUiStore((s) => !s.expertMode);
  const labelLength = explained ? 'box size' : 'L_box';
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-baseline gap-2 font-mono text-[10px] text-(--color-ink-3) uppercase tracking-wider">
        <span>{labelLength}</span>
      </div>
      <div className="flex items-baseline gap-3 font-mono text-[12px]">
        <span className="text-(--color-ink-1)">{fmtMpc(mpc)}</span>
        <span className="text-(--color-ink-3)">·</span>
        <span className="text-(--color-ink-2)">{fmtLy(mpc)}</span>
      </div>
      <svg
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        className="h-1.5 w-32 text-(--color-dm-high)"
        aria-hidden
      >
        <line x1="0" y1="3" x2="100" y2="3" stroke="currentColor" strokeWidth="1.2" />
        <line x1="0" y1="0.5" x2="0" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="100" y1="0.5" x2="100" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
