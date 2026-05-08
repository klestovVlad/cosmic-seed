import { useEffect, useRef } from 'react';
import { growthFactor, PLANCK_2018, scaleFactor } from '@physics/index';
import { useSimulationStore } from '@state/simulationStore';
import { useUiStore } from '@state/uiStore';

// Stage 2c3 — diagnostic chart from EXPERIENCE.md §6: log-log of δ_max(a)
// vs the Carroll–Press–Turner growth factor D(a). For a small perturbation,
// the simulation curve should track the dotted reference line; once δ_max
// approaches 1 the curve bends upward as the structure goes nonlinear.
//
// Painting on a 2-D canvas avoids pulling in a chart library and the
// data set is tiny (a few hundred samples, refreshed at HUD cadence).

const W = 220;
const H = 120;
const MARGIN = { top: 8, right: 8, bottom: 16, left: 24 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;

function logScale(x: number, lo: number, hi: number, range: number): number {
  if (x <= 0 || lo <= 0 || hi <= lo) return 0;
  const t = (Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return t * range;
}

export function DeltaMaxChart(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samples = useSimulationStore((s) => s.densitySamples);
  const explained = useUiStore((s) => !s.expertMode);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${String(W)}px`;
    canvas.style.height = `${String(H)}px`;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (samples.length < 2) return;

    // Axis ranges. a is the cosmological scale factor; δ is normalized
    // peak density in [δ_init / max, ...]. Floor δ at 1 so the log domain
    // is positive; clamp to [a_min, 1] for x.
    const aMin = Math.min(...samples.map((s) => s.a));
    const aMax = Math.max(...samples.map((s) => s.a));
    const deltaMin = 1;
    const deltaMax = Math.max(...samples.map((s) => Math.max(s.delta, 1)));
    const xRange = Math.max(aMax / aMin, 1.1);

    ctx.translate(MARGIN.left, MARGIN.top);

    // Frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, PLOT_W, PLOT_H);

    // Linear-theory reference: D(a)/D(a_init) (normalised at first sample).
    const aInit = samples[0]?.a ?? aMin;
    const D_init = growthFactor(scaleFactor(aInit), PLANCK_2018);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(155,127,232,0.45)';
    ctx.setLineDash([4, 3]);
    for (let i = 0; i < 64; i += 1) {
      const a = aMin * Math.pow(xRange, i / 63);
      const D = growthFactor(scaleFactor(a), PLANCK_2018);
      const refDelta = Math.max(1, D / D_init);
      const x = logScale(a, aMin, aMax, PLOT_W);
      const y = PLOT_H - logScale(refDelta, deltaMin, deltaMax, PLOT_H);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Sim curve.
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (sample === undefined) continue;
      const x = logScale(sample.a, aMin, aMax, PLOT_W);
      const y = PLOT_H - logScale(Math.max(sample.delta, deltaMin), deltaMin, deltaMax, PLOT_H);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [samples]);

  return (
    <div className="pointer-events-none absolute top-32 right-3 z-20 rounded-md border border-white/10 bg-black/40 p-2 backdrop-blur-sm">
      <div className="mb-1 flex items-baseline justify-between font-mono text-[9px] tracking-wider text-(--color-ink-3) uppercase">
        <span>{explained ? 'density growth' : 'δ_max(a)'}</span>
        <span className="text-(--color-ink-2)">{samples.length} pts</span>
      </div>
      <canvas ref={canvasRef} aria-hidden />
      <p className="mt-1 max-w-[200px] font-mono text-[9px] text-(--color-ink-3)">
        {explained
          ? 'White: peak density vs scale factor. Dashed: linear theory.'
          : 'log δ_max / δ_max(a₀)  vs  log a · D(a)/D(a₀)'}
      </p>
    </div>
  );
}
