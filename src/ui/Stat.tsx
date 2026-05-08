interface StatProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export function Stat({ label, value, hint }: StatProps): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-(--color-ink-3) text-[10px] tracking-wider uppercase">{label}</span>
      <span className="font-mono text-[12px] text-(--color-ink-1)" title={hint}>
        {value}
      </span>
    </div>
  );
}
