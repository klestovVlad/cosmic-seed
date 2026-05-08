import { create } from 'zustand';

interface UiState {
  showFps: boolean;
  toggleFps: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  showFps: true,
  toggleFps: () => {
    set((s) => ({ showFps: !s.showFps }));
  },
}));
