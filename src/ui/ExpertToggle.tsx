// Expert/Explained toggle (EXPERIENCE.md §10). Lives top-left of the
// canvas, opposite the run-state badge. A two-cell pill so the active
// register is unambiguous; clicking the inactive cell flips it.
//
// Defaults to Explained. The toggle owns persistence on its own
// effects: read URL/localStorage on mount, write back on every change.

import { useEffect } from 'react';
import { useUiStore } from '@state/uiStore';
import {
  resolveInitialExpertMode,
  writeExpertModeToStorage,
  writeExpertModeToUrlString,
} from './i18n/expert-mode-url';

export function ExpertToggle(): React.JSX.Element {
  const expertMode = useUiStore((s) => s.expertMode);
  const setExpertMode = useUiStore((s) => s.setExpertMode);

  // Resolve initial value from URL (highest priority for shared links)
  // → localStorage (last-visit memory) → default Explained.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initial = resolveInitialExpertMode({
      urlSearch: window.location.search,
      storage: window.localStorage,
    });
    setExpertMode(initial);
  }, [setExpertMode]);

  // Sync the current value back to URL + localStorage on every change.
  // History.replaceState keeps the URL editable without growing the back
  // stack; localStorage is the cross-session fallback.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = writeExpertModeToUrlString(window.location.search, expertMode);
    const url = window.location.pathname + next + window.location.hash;
    window.history.replaceState(null, '', url);
    writeExpertModeToStorage(window.localStorage, expertMode);
  }, [expertMode]);

  return (
    <div className="pointer-events-auto absolute top-3 left-3 z-30 sm:top-4 sm:left-4">
      <div
        role="group"
        aria-label="Label register"
        className="flex items-center gap-0 rounded-md border border-white/10 bg-black/40 p-0.5 backdrop-blur-sm"
      >
        <button
          type="button"
          aria-pressed={!expertMode}
          data-testid="expert-toggle-explained"
          onClick={() => {
            setExpertMode(false);
          }}
          className={
            expertMode
              ? 'rounded-sm px-2 py-1 font-mono text-[11px] tracking-wider text-(--color-ink-3) uppercase transition-colors hover:text-(--color-ink-1)'
              : 'rounded-sm bg-white/10 px-2 py-1 font-mono text-[11px] tracking-wider text-(--color-ink-1) uppercase'
          }
        >
          explained
        </button>
        <button
          type="button"
          aria-pressed={expertMode}
          data-testid="expert-toggle-expert"
          onClick={() => {
            setExpertMode(true);
          }}
          className={
            expertMode
              ? 'rounded-sm bg-white/10 px-2 py-1 font-mono text-[11px] tracking-wider text-(--color-ink-1) uppercase'
              : 'rounded-sm px-2 py-1 font-mono text-[11px] tracking-wider text-(--color-ink-3) uppercase transition-colors hover:text-(--color-ink-1)'
          }
        >
          expert
        </button>
      </div>
    </div>
  );
}
