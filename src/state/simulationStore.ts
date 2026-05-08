import { create } from 'zustand';

export interface SimulationDiagnostics {
  readonly step: number;
  readonly time: number;
  readonly fps: number;
  readonly stepsPerSecond: number;
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
  readonly totalEnergy: number;
  readonly initialTotalEnergy: number;
  readonly virialRatio: number;
  readonly centralDensity: number;
  readonly maxCentralDensity: number;
  readonly momentumMagnitude: number;
}

export interface SimulationState {
  particleCount: number;
  isRunning: boolean;
  stepsPerFrame: number;
  diagnostics: SimulationDiagnostics;

  setParticleCount(n: number): void;
  setRunning(running: boolean): void;
  setStepsPerFrame(n: number): void;
  setDiagnostics(d: SimulationDiagnostics): void;
}

const emptyDiagnostics: SimulationDiagnostics = {
  step: 0,
  time: 0,
  fps: 0,
  stepsPerSecond: 0,
  kineticEnergy: 0,
  potentialEnergy: 0,
  totalEnergy: 0,
  initialTotalEnergy: 0,
  virialRatio: 0,
  centralDensity: 0,
  maxCentralDensity: 0,
  momentumMagnitude: 0,
};

export const useSimulationStore = create<SimulationState>((set) => ({
  particleCount: 0,
  isRunning: false,
  stepsPerFrame: 4,
  diagnostics: emptyDiagnostics,

  setParticleCount: (n) => {
    set({ particleCount: n });
  },
  setRunning: (running) => {
    set({ isRunning: running });
  },
  setStepsPerFrame: (n) => {
    set({ stepsPerFrame: n });
  },
  setDiagnostics: (d) => {
    set({ diagnostics: d });
  },
}));
