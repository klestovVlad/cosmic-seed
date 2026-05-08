import { useSimulationStore } from '@state/simulationStore';
import { formatSolarMass as fmtMass, massAnchor } from './mass-anchor';
import { Stat } from './Stat';

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return n.toExponential(digits);
  return n.toFixed(digits);
}

function fmtPercent(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function Hud(): React.JSX.Element {
  const { particleCount, isRunning, stepsPerFrame, diagnostics: d } = useSimulationStore();

  const drift =
    d.initialTotalEnergy === 0
      ? 0
      : (d.totalEnergy - d.initialTotalEnergy) / Math.abs(d.initialTotalEnergy);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col p-3 text-(--color-ink-1) sm:p-4">
      {/* Top row — run-state badge in the corner. The wordmark moved into the
          TimeStrip in Stage 2a; the Spherical Collapse heading still anchors
          the e2e test until cosmological IC arrives. */}
      <div className="flex items-start justify-end">
        <h1 className="sr-only">Spherical Collapse</h1>
        <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span
              aria-hidden
              className={
                isRunning
                  ? 'inline-block size-1.5 rounded-full bg-emerald-400'
                  : 'inline-block size-1.5 rounded-full bg-(--color-ink-3)'
              }
            />
            <span data-testid="run-state" className="tracking-wider text-(--color-ink-2) uppercase">
              {isRunning ? 'running' : 'paused'}
            </span>
          </div>
        </div>
      </div>

      <div className="grow" />

      {/* First-ignition banner — appears the moment the first halo crosses M_crit. */}
      {d.firstIgnition !== null && (
        <div className="pointer-events-auto mx-auto mb-3 max-w-md rounded-md border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-center font-mono text-[11px] text-amber-100 backdrop-blur-sm">
          <span className="text-amber-300">first star ignited</span> · z ={' '}
          {d.firstIgnition.redshift.toFixed(1)} · M_halo = {fmtMass(d.firstIgnition.haloMassMsun)}
        </div>
      )}

      {/* Bottom: stats panel */}
      <div className="pointer-events-auto grid grid-cols-1 gap-3 sm:grid-cols-5">
        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            simulation
          </h2>
          <div className="space-y-1">
            <Stat label="particles" value={particleCount.toString()} />
            <Stat label="step" value={d.step.toString()} />
            <Stat label="time" value={fmt(d.time)} />
            <Stat label="fps" value={fmt(d.fps, 1)} />
            <Stat label="steps/s" value={fmt(d.stepsPerSecond, 0)} />
            <Stat label="steps/frame" value={stepsPerFrame.toString()} />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            energy
          </h2>
          <div className="space-y-1">
            <Stat label="kinetic T" value={fmt(d.kineticEnergy, 4)} />
            <Stat label="potential U" value={fmt(d.potentialEnergy, 4)} />
            <Stat label="total E" value={fmt(d.totalEnergy, 4)} />
            <Stat
              label="drift"
              value={fmtPercent(drift)}
              hint="(E − E₀) / |E₀|; integrator should keep this small."
            />
            <Stat label="−T/U" value={fmt(d.virialRatio, 3)} hint="0.5 in virial equilibrium" />
            <Stat label="‖p‖" value={fmt(d.momentumMagnitude, 4)} />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            density
          </h2>
          <div className="space-y-1">
            <Stat label="ρ central" value={fmt(d.centralDensity, 3)} />
            <Stat label="ρ max" value={fmt(d.maxCentralDensity, 3)} />
            <Stat
              label="ρ / ρ₀"
              value={fmt(d.maxCentralDensity / Math.max(1e-9, d.centralDensity || 1), 2)}
              hint="Growth of central density relative to current."
            />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            gas
          </h2>
          <div className="space-y-1">
            <Stat
              label="mass frac"
              value={d.gasMassFraction > 0 ? fmtPercent(d.gasMassFraction, 1) : '—'}
              hint="Fraction of total mass that's baryons (Ω_b/Ω_m ≈ 0.157)"
            />
            <Stat
              label="mean u"
              value={d.gasMassFraction > 0 ? fmt(d.gasMeanInternalEnergy, 4) : '—'}
              hint="Average gas internal energy (proxy for temperature)"
            />
            <Stat
              label="max u"
              value={d.gasMassFraction > 0 ? fmt(d.gasMaxInternalEnergy, 4) : '—'}
              hint="Hottest gas particle. Heated via adiabatic compression."
            />
            <Stat
              label="u_max / u_0"
              value={
                d.gasMassFraction > 0
                  ? fmt(d.gasMaxInternalEnergy / Math.max(1e-9, d.gasMeanInternalEnergy), 1)
                  : '—'
              }
              hint="Compression-heating amplification factor."
            />
            <Stat
              label="T_min"
              value={
                d.gasMassFraction > 0 && d.gasMinTemperatureK > 0
                  ? `${d.gasMinTemperatureK.toFixed(0)} K`
                  : '—'
              }
              hint="Coldest gas particle (Stage 4c — H₂ cooling)."
            />
            <Stat
              label="x_H₂ peak"
              value={d.gasMassFraction > 0 ? fmt(d.gasMaxH2Fraction, 2) : '—'}
              hint="Densest cool gas builds molecular hydrogen — the v1 coolant (Stage 4c2)."
            />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            halos & stars
          </h2>
          <div className="space-y-1">
            <Stat
              label="halos"
              value={d.haloCount.toString()}
              hint="FoF clusters above minMembers"
            />
            <Stat
              label="largest M"
              value={d.largestHaloMass > 0 ? fmt(d.largestHaloMass, 4) : '—'}
              hint="Most massive halo (code units)"
            />
            <Stat
              label="stars"
              value={d.starCount.toString()}
              hint="Halos that have crossed M_crit and ignited Pop III"
            />
            <Stat
              label="first z"
              value={d.firstIgnition !== null ? d.firstIgnition.redshift.toFixed(1) : '—'}
              hint="Redshift of the first ignition event"
            />
            <Stat
              label="first M"
              value={d.firstIgnition !== null ? fmtMass(d.firstIgnition.haloMassMsun) : '—'}
              hint={
                d.firstIgnition !== null
                  ? massAnchor(d.firstIgnition.haloMassMsun)
                  : 'Halo mass at first ignition'
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}
