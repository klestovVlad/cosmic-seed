// Seeded PRNG. RULES §6: never `Math.random()` in physics.
// `mulberry32` from Tommy Ettinger; small, fast, good enough for ICs.

export interface Random {
  readonly seed: number;
  uniform(): number;
  uniformIn(min: number, max: number): number;
  normal(): number;
}

export function createRandom(seed: number): Random {
  let s = seed | 0;
  let spare: number | null = null;

  const uniform = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const uniformIn = (min: number, max: number): number => min + (max - min) * uniform();

  // Box–Muller, with one cached sample. Standard normal: mean 0, stdev 1.
  const normal = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = uniform();
    while (u2 === 0) u2 = uniform();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const phi = 2 * Math.PI * u2;
    spare = mag * Math.sin(phi);
    return mag * Math.cos(phi);
  };

  return { seed, uniform, uniformIn, normal };
}
