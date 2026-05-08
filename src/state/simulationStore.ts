import { create } from 'zustand';

export interface SimulationDiagnostics {
  readonly step: number;
  /** Simulation time in code units (legacy from Stage 1). */
  readonly time: number;
  /** Cosmic time elapsed since Big Bang, in Myr. Stage 2c+ */
  readonly ageInMyr: number;
  /** Scale factor a(t). z = 1/a − 1. Stage 2c+ */
  readonly scaleFactor: number;
  /** Redshift z. Convenience for the HUD. */
  readonly redshift: number;
  readonly fps: number;
  readonly stepsPerSecond: number;
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
  readonly totalEnergy: number;
  readonly initialTotalEnergy: number;
  readonly virialRatio: number;
  readonly centralDensity: number;
  readonly maxCentralDensity: number;
  readonly maxParticleDensity: number;
  readonly momentumMagnitude: number;
  /** Stage 3b: gas-specific (0 when gasCount = 0). */
  readonly gasMassFraction: number;
  readonly gasMeanInternalEnergy: number;
  readonly gasMaxInternalEnergy: number;
  /** Stage 4c: coldest gas particle's u (code) and T (K). */
  readonly gasMinInternalEnergy: number;
  readonly gasMinTemperatureK: number;
  /** Stage 4c2: peak / mean H₂ number-fraction across gas particles. */
  readonly gasMaxH2Fraction: number;
  readonly gasMeanH2Fraction: number;
  readonly coolingMaxSubsteps: number;
  readonly coolingCappedThisStep: boolean;
  /** Stage 4: halo + star diagnostics. */
  readonly haloCount: number;
  readonly largestHaloMass: number;
  /** Code-unit centre of the most massive halo, or null when no halos exist.
   *  Used by the in-scene annotation pin (EXPERIENCE.md §3). */
  readonly largestHaloCentre: { x: number; y: number; z: number } | null;
  readonly starCount: number;
  /** First-ignition event. Position is in code-unit space; the pin overlay
   *  projects it back to screen each frame. */
  readonly firstIgnition: {
    readonly redshift: number;
    readonly haloMassMsun: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null;
}

export interface DensitySample {
  /** Scale factor at sample time. */
  readonly a: number;
  /** Max particle density relative to its initial value. δ_max(a) / δ_max(a_init). */
  readonly delta: number;
}

export interface SimulationState {
  particleCount: number;
  isRunning: boolean;
  stepsPerFrame: number;
  diagnostics: SimulationDiagnostics;
  /** Ring of (a, δ_max/δ_max_init) samples for the diagnostic chart. */
  densitySamples: readonly DensitySample[];

  setParticleCount(n: number): void;
  setRunning(running: boolean): void;
  setStepsPerFrame(n: number): void;
  setDiagnostics(d: SimulationDiagnostics): void;
  pushDensitySample(s: DensitySample): void;
  resetDensitySamples(): void;
}

const emptyDiagnostics: SimulationDiagnostics = {
  step: 0,
  time: 0,
  ageInMyr: 0,
  scaleFactor: 0,
  redshift: 0,
  fps: 0,
  stepsPerSecond: 0,
  kineticEnergy: 0,
  potentialEnergy: 0,
  totalEnergy: 0,
  initialTotalEnergy: 0,
  virialRatio: 0,
  centralDensity: 0,
  maxCentralDensity: 0,
  maxParticleDensity: 0,
  momentumMagnitude: 0,
  gasMassFraction: 0,
  gasMeanInternalEnergy: 0,
  gasMaxInternalEnergy: 0,
  gasMinInternalEnergy: 0,
  gasMinTemperatureK: 0,
  gasMaxH2Fraction: 0,
  gasMeanH2Fraction: 0,
  coolingMaxSubsteps: 0,
  coolingCappedThisStep: false,
  haloCount: 0,
  largestHaloMass: 0,
  largestHaloCentre: null,
  starCount: 0,
  firstIgnition: null,
};

const MAX_DENSITY_SAMPLES = 512;

export const useSimulationStore = create<SimulationState>((set) => ({
  particleCount: 0,
  isRunning: false,
  stepsPerFrame: 4,
  diagnostics: emptyDiagnostics,
  densitySamples: [],

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
  pushDensitySample: (s) => {
    set((state) => {
      const next =
        state.densitySamples.length >= MAX_DENSITY_SAMPLES
          ? [...state.densitySamples.slice(1), s]
          : [...state.densitySamples, s];
      return { densitySamples: next };
    });
  },
  resetDensitySamples: () => {
    set({ densitySamples: [] });
  },
}));
