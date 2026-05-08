import { FpsOverlay } from '@ui/FpsOverlay';
import { Starfield } from '@ui/Starfield';

function App(): React.JSX.Element {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <Starfield />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[11px] tracking-[0.4em] text-(--color-ink-3) uppercase">
          v0 · stage 0 · foundation
        </p>
        <h1 className="mt-4 font-mono text-5xl font-light tracking-tight text-(--color-ink-1) sm:text-6xl md:text-7xl">
          Cosmic&nbsp;Seed
        </h1>
        <p className="mt-6 max-w-xl text-balance text-sm leading-relaxed text-(--color-ink-2) sm:text-base">
          A browser-native simulation of how dark-matter halos grow, baryons fall in, and the first
          stars ignite — built in public, one stage at a time.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-xs text-(--color-ink-3)">
          <span className="font-mono">z = 100 → 6</span>
          <span className="opacity-40">·</span>
          <span className="font-mono">10 000 DM particles</span>
          <span className="opacity-40">·</span>
          <span className="font-mono">WebGPU</span>
        </div>
      </div>

      <FpsOverlay />
    </main>
  );
}

export default App;
