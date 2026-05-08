// Single-parameter slider row. Reads pending value (UI is editing live)
// and emits setParameter on every change. The store decides whether the
// edit commits immediately or buffers behind a "Regenerate" button.

import { useUiStore } from '@state/uiStore';
import { useParametersStore } from '@state/parametersStore';
import { type ParameterKey, PARAMETER_SCHEMA } from '@state/parameters/schema';
import { getLabel } from '@ui/i18n/labels';

interface ParameterSliderProps {
  readonly paramKey: ParameterKey;
}

function formatValue(value: number, step: number): string {
  if (step >= 1) return value.toFixed(0);
  if (step >= 0.1) return value.toFixed(1);
  if (step >= 0.01) return value.toFixed(2);
  return value.toFixed(3);
}

export function ParameterSlider({ paramKey }: ParameterSliderProps): React.JSX.Element {
  const spec = PARAMETER_SCHEMA[paramKey];
  const expertMode = useUiStore((s) => s.expertMode);
  const value = useParametersStore((s) => s.pending[paramKey]);
  const committed = useParametersStore((s) => s.committed[paramKey]);
  const label = getLabel(spec.labelKey, expertMode ? 'expert' : 'explained');
  const isPending = spec.requiresRegen && value !== committed;

  const onSliderChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    useParametersStore.getState().setParameter(paramKey, Number(e.target.value));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
        <span className="text-(--color-ink-2)" title={spec.help}>
          {label}
        </span>
        <span className={isPending ? 'text-amber-200' : 'text-(--color-ink-1)'}>
          {formatValue(value, spec.step)}
          {isPending ? ' *' : ''}
        </span>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={onSliderChange}
        aria-label={label}
        className="w-full accent-(--color-dm-mid)"
      />
    </div>
  );
}
