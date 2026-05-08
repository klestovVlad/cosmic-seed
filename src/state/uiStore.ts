import { create } from 'zustand';

export type GpuStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'supported' };

interface UiState {
  showFps: boolean;
  toggleFps: () => void;

  gpuStatus: GpuStatus;
  setGpuStatus: (s: GpuStatus) => void;
}

export const useUiStore = create<UiState>((set) => ({
  showFps: true,
  toggleFps: () => {
    set((s) => ({ showFps: !s.showFps }));
  },
  gpuStatus: { kind: 'pending' },
  setGpuStatus: (gpuStatus) => {
    set({ gpuStatus });
  },
}));
