import { useSimulationStore } from '@state/simulationStore';
import { getLabel, type LabelKey } from './i18n/labels';
import { useUiStore } from '@state/uiStore';
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

interface LabeledStatProps {
  readonly labelKey: LabelKey;
  readonly value: string;
  readonly hint?: string;
  readonly mode: 'expert' | 'explained';
}

function LabeledStat({ labelKey, value, hint, mode }: LabeledStatProps): React.JSX.Element {
  const props: { label: string; value: string; hint?: string } = {
    label: getLabel(labelKey, mode),
    value,
  };
  if (hint !== undefined) props.hint = hint;
  return <Stat {...props} />;
}

export function Hud(): React.JSX.Element {
  const { particleCount, isRunning, stepsPerFrame, diagnostics: d } = useSimulationStore();
  const expertMode = useUiStore((s) => s.expertMode);
  const mode: 'expert' | 'explained' = expertMode ? 'expert' : 'explained';

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
          <span className="text-amber-300">first star ignited</span> · {getLabel('redshift', mode)}{' '}
          = {d.firstIgnition.redshift.toFixed(1)} · {expertMode ? 'M_halo' : 'halo mass'} ={' '}
          {fmtMass(d.firstIgnition.haloMassMsun)}
        </div>
      )}

      {/* Bottom: stats panel */}
      <div className="pointer-events-auto grid grid-cols-1 gap-3 sm:grid-cols-5">
        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            simulation
          </h2>
          <div className="space-y-1">
            <LabeledStat labelKey="particles" mode={mode} value={particleCount.toString()} />
            <LabeledStat labelKey="step" mode={mode} value={d.step.toString()} />
            <LabeledStat labelKey="simTime" mode={mode} value={fmt(d.time)} />
            <LabeledStat labelKey="fps" mode={mode} value={fmt(d.fps, 1)} />
            <LabeledStat labelKey="stepsPerSecond" mode={mode} value={fmt(d.stepsPerSecond, 0)} />
            <LabeledStat labelKey="stepsPerFrame" mode={mode} value={stepsPerFrame.toString()} />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            energy
          </h2>
          <div className="space-y-1">
            <LabeledStat labelKey="kineticEnergy" mode={mode} value={fmt(d.kineticEnergy, 4)} />
            <LabeledStat labelKey="potentialEnergy" mode={mode} value={fmt(d.potentialEnergy, 4)} />
            <LabeledStat labelKey="totalEnergy" mode={mode} value={fmt(d.totalEnergy, 4)} />
            <LabeledStat
              labelKey="energyDrift"
              mode={mode}
              value={fmtPercent(drift)}
              hint="(E − E₀) / |E₀|; integrator should keep this small."
            />
            <LabeledStat
              labelKey="virialRatio"
              mode={mode}
              value={fmt(d.virialRatio, 3)}
              hint="0.5 in virial equilibrium"
            />
            <LabeledStat labelKey="momentum" mode={mode} value={fmt(d.momentumMagnitude, 4)} />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            density
          </h2>
          <div className="space-y-1">
            <LabeledStat labelKey="centralDensity" mode={mode} value={fmt(d.centralDensity, 3)} />
            <LabeledStat labelKey="peakDensity" mode={mode} value={fmt(d.maxCentralDensity, 3)} />
            <LabeledStat
              labelKey="densityGrowth"
              mode={mode}
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
            <LabeledStat
              labelKey="gasMassFraction"
              mode={mode}
              value={d.gasMassFraction > 0 ? fmtPercent(d.gasMassFraction, 1) : '—'}
              hint="Fraction of total mass that's baryons (Ω_b/Ω_m ≈ 0.157)"
            />
            <LabeledStat
              labelKey="meanGasEnergy"
              mode={mode}
              value={d.gasMassFraction > 0 ? fmt(d.gasMeanInternalEnergy, 4) : '—'}
              hint="Average gas internal energy (proxy for temperature)"
            />
            <LabeledStat
              labelKey="peakGasEnergy"
              mode={mode}
              value={d.gasMassFraction > 0 ? fmt(d.gasMaxInternalEnergy, 4) : '—'}
              hint="Hottest gas particle. Heated via adiabatic compression."
            />
            <LabeledStat
              labelKey="compressionHeating"
              mode={mode}
              value={
                d.gasMassFraction > 0
                  ? fmt(d.gasMaxInternalEnergy / Math.max(1e-9, d.gasMeanInternalEnergy), 1)
                  : '—'
              }
              hint="Compression-heating amplification factor."
            />
            <LabeledStat
              labelKey="minGasTemperature"
              mode={mode}
              value={
                d.gasMassFraction > 0 && d.gasMinTemperatureK > 0
                  ? `${d.gasMinTemperatureK.toFixed(0)} K`
                  : '—'
              }
              hint="Coldest gas particle. H₂ cooling drives this down."
            />
            <LabeledStat
              labelKey="peakH2Fraction"
              mode={mode}
              value={d.gasMassFraction > 0 ? fmt(d.gasMaxH2Fraction, 2) : '—'}
              hint="Densest cool gas builds molecular hydrogen — the v1 coolant."
            />
          </div>
        </section>

        <section className="rounded-md border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
            halos & stars
          </h2>
          <div className="space-y-1">
            <LabeledStat
              labelKey="haloCount"
              mode={mode}
              value={d.haloCount.toString()}
              hint="FoF clusters above minMembers"
            />
            <LabeledStat
              labelKey="largestHaloMass"
              mode={mode}
              value={d.largestHaloMass > 0 ? fmt(d.largestHaloMass, 4) : '—'}
              hint="Most massive halo (code units)"
            />
            <LabeledStat
              labelKey="starCount"
              mode={mode}
              value={d.starCount.toString()}
              hint="Halos that have crossed M_crit and ignited Pop III"
            />
            <LabeledStat
              labelKey="firstIgnitionRedshift"
              mode={mode}
              value={d.firstIgnition !== null ? d.firstIgnition.redshift.toFixed(1) : '—'}
              hint="Redshift of the first ignition event"
            />
            <LabeledStat
              labelKey="firstIgnitionMass"
              mode={mode}
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
