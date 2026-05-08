import { create } from 'zustand';

export type GpuStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'supported' };

interface UiState {
  showFps: boolean;
  toggleFps: () => void;

  /** Expert (true) shows physics symbols; Explained (false) is the default. */
  expertMode: boolean;
  setExpertMode: (v: boolean) => void;
  toggleExpertMode: () => void;

  gpuStatus: GpuStatus;
  setGpuStatus: (s: GpuStatus) => void;
}

export const useUiStore = create<UiState>((set) => ({
  showFps: true,
  toggleFps: () => {
    set((s) => ({ showFps: !s.showFps }));
  },
  expertMode: false,
  setExpertMode: (v) => {
    set({ expertMode: v });
  },
  toggleExpertMode: () => {
    set((s) => ({ expertMode: !s.expertMode }));
  },
  gpuStatus: { kind: 'pending' },
  setGpuStatus: (gpuStatus) => {
    set({ gpuStatus });
  },
}));
