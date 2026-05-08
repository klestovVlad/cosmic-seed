// `useLabel` — the canonical way to render a label-pair on screen.
// Subscribes to `expertMode` only (not the whole uiStore), so a HUD
// row using `useLabel('virialRatio')` re-renders precisely when the
// toggle flips and never when an unrelated UI flag (FPS overlay, GPU
// status banner, …) changes.

import { useUiStore } from '@state/uiStore';
import { getLabel, type LabelKey } from './labels';

export function useLabel(key: LabelKey): string {
  const expertMode = useUiStore((s) => s.expertMode);
  return getLabel(key, expertMode ? 'expert' : 'explained');
}
