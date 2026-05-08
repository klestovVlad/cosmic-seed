// Right-side Controls panel — Stage 5b. Houses the parameter sliders
// grouped by physics topic, plus a Regenerate button when any pending
// regen-required value differs from its committed counterpart.
//
// Mobile responsiveness lands in Stage 7. For now the panel is a fixed
// right-side card on viewports ≥ 1024 px and hidden below — the
// underlying store is still active so URL params keep flowing.

import { useUiStore } from '@state/uiStore';
import { useParametersStore } from '@state/parametersStore';
import { PARAMETER_SCHEMA, type ParameterGroup, type ParameterKey } from '@state/parameters/schema';
import { ParameterSlider } from './ParameterSlider';

const GROUP_TITLE: Record<ParameterGroup, { expert: string; explained: string }> = {
  cosmology: { expert: 'cosmology', explained: 'cosmology' },
  baryons: { expert: 'baryons', explained: 'baryons' },
  ignition: { expert: 'ignition', explained: 'first stars' },
};

const GROUPED_KEYS: Record<ParameterGroup, readonly ParameterKey[]> = (() => {
  const out: Record<ParameterGroup, ParameterKey[]> = {
    cosmology: [],
    baryons: [],
    ignition: [],
  };
  for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
    out[PARAMETER_SCHEMA[k].group].push(k);
  }
  return out;
})();

export function ControlsPanel(): React.JSX.Element {
  const expertMode = useUiStore((s) => s.expertMode);
  const hasPendingRegen = useParametersStore((s) => s.hasPendingRegen);

  const onCommit = (): void => {
    useParametersStore.getState().commitRegen();
  };
  const onReset = (): void => {
    useParametersStore.getState().resetRegen();
  };

  return (
    <aside className="pointer-events-auto absolute top-16 left-3 z-30 hidden w-[260px] flex-col gap-3 rounded-md border border-white/10 bg-black/55 p-3 backdrop-blur-sm sm:top-20 sm:left-4 lg:flex">
      <h2 className="font-mono text-[10px] tracking-[0.3em] text-(--color-ink-3) uppercase">
        controls
      </h2>
      {(Object.keys(GROUPED_KEYS) as ParameterGroup[]).map((group) => {
        const keys = GROUPED_KEYS[group];
        if (keys.length === 0) return null;
        return (
          <section key={group} className="space-y-2">
            <h3 className="font-mono text-[9px] tracking-[0.25em] text-(--color-ink-3) uppercase">
              {expertMode ? GROUP_TITLE[group].expert : GROUP_TITLE[group].explained}
            </h3>
            <div className="space-y-3">
              {keys.map((k) => (
                <ParameterSlider key={k} paramKey={k} />
              ))}
            </div>
          </section>
        );
      })}
      {hasPendingRegen ? (
        <div className="mt-1 flex items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/10 p-2">
          <p className="grow font-mono text-[10px] text-amber-100">
            IC parameter changed. Regenerate to apply.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="rounded px-2 py-1 font-mono text-[10px] text-(--color-ink-2) uppercase transition-colors hover:text-(--color-ink-1)"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onCommit}
            className="rounded bg-amber-300/20 px-2 py-1 font-mono text-[10px] tracking-wider text-amber-100 uppercase transition-colors hover:bg-amber-300/30"
            data-testid="regenerate-button"
          >
            regenerate
          </button>
        </div>
      ) : null}
    </aside>
  );
}
