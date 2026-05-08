// Public API of the physics layer. Other modules import from this barrel only.

export {
  aOfZ,
  type CodeDensity,
  type CodeEnergy,
  type CodeLength,
  type CodeMass,
  type CodeTime,
  type CodeVelocity,
  asNumber,
  codeDensity,
  codeEnergy,
  codeLength,
  codeMass,
  codeTime,
  codeVelocity,
  type HubbleRate,
  hubbleRate,
  MLY_PER_MPC,
  type Mpc,
  mpc,
  type Msun,
  msun,
  type Myr,
  myr,
  type Redshift,
  redshift,
  type ScaleFactor,
  scaleFactor,
  zOfA,
} from './units';
export { GRAVITATIONAL_CONSTANT } from './constants';
export {
  type CosmologyParams,
  growthFactor,
  growthRate,
  h0InvMyr,
  hubbleAt,
  hubbleAtRedshift,
  PLANCK_2018,
  speedOfTimeReadout,
  tOfA,
  aOfT,
} from './cosmology';
export {
  amplitudeFromSigma8,
  eisensteinHuTransfer,
  PLANCK_2018_PS,
  type PowerSpectrumParams,
  powerSpectrum,
  powerSpectrumShape,
  sigma8,
  topHatWindow,
} from './power-spectrum';
export { fft1d, fft3d } from './fft';
export { type ZeldovichOutput, type ZeldovichParams, zeldovichField } from './zeldovich-ic';
export { cubicSplineKernel, type SphKernel } from './sph-kernels';
export { computeSphDensity, computeSphDensityForRange } from './sph-density';
export { computeSphForcesAndEnergy, type SphForceOptions, type SphForceOutputs } from './sph-force';
export { createRandom, type Random } from './random';
export {
  centerOfMass,
  createParticleSystem,
  type ParticleSystem,
  setParticle,
  totalMass,
  totalMomentum,
} from './particle-system';
export {
  computeAccelerations,
  type GravityOptions,
  kineticEnergy,
  potentialEnergy,
} from './gravity-cpu';
export {
  type CosmologicalLeapfrogOptions,
  cosmologicalLeapfrogStep,
  createLeapfrogState,
  type ForceEvaluator,
  leapfrogStep,
  type LeapfrogState,
} from './leapfrog';
export {
  keplerTwoBody,
  type PlummerIC,
  plummerSphere,
  sphericalPerturbation,
  type SphericalPerturbationIC,
} from './initial-conditions';
export {
  centralDensity,
  type EnergyReport,
  energyReport,
  type MomentumReport,
  momentumReport,
} from './diagnostics';
export {
  computeDensities,
  createSpatialGrid,
  type DensityKernel,
  poly6Kernel,
  rebuildSpatialGrid,
  type SpatialGrid,
  type SpatialGridSpec,
} from './spatial-grid';
