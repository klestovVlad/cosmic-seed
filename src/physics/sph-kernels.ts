// SPH kernels per Monaghan (1992), "Smoothed Particle Hydrodynamics",
// Annual Review of Astronomy and Astrophysics 30, 543.
//
// The 3-D cubic spline (M4) is the standard SPH kernel:
//
//   W(r, h) = σ_3 ·
//     { 1 − (3/2) q² + (3/4) q³        for 0 ≤ q ≤ 1
//       (1/4) (2 − q)³                  for 1 ≤ q ≤ 2
//       0                               for q > 2 }
//
//   where q = r / h, σ_3 = 1 / (π h³) is the 3-D normalisation constant
//   chosen so ∫ W(r) d³r = 1 over a sphere of radius 2h. The kernel has
//   compact support of radius 2h.
//
// The gradient comes from dW/dr — a scalar; the full ∇W vector is
// (dW/dr) · r̂. We expose the scalar so callers can multiply by the
// already-computed (r_j − r_i) / r vector.
//
// We do NOT use the poly6 kernel from `spatial-grid.ts` here: that one is
// good for visualisation but its second derivative is non-monotone, which
// makes it numerically unstable for actual hydrodynamics. The cubic spline
// is the one every standard SPH code uses (GADGET, PHANTOM, GIZMO, …).

export interface SphKernel {
  readonly h: number;
  readonly hInv: number;
  /** Truncation radius (= 2h for the M4 cubic spline). */
  readonly support: number;
  /** Kernel value W(r) at distance r ≥ 0. Returns 0 for r ≥ support. */
  weight(r: number): number;
  /**
   * dW/dr at distance r ≥ 0. The vector gradient ∇_i W(r_ij) is then
   *   (dW/dr) · (r_j − r_i) / r_ij     (note the sign: ∇_i means with
   * respect to particle i, so the unit vector points from i to j).
   * Returns 0 for r ≥ support and a well-defined finite value at r → 0.
   */
  gradient(r: number): number;
}

export function cubicSplineKernel(h: number): SphKernel {
  if (h <= 0) {
    throw new RangeError(`cubicSplineKernel: h must be positive, got ${String(h)}`);
  }
  const hInv = 1 / h;
  const norm = 1 / (Math.PI * h * h * h);
  const support = 2 * h;

  return {
    h,
    hInv,
    support,
    weight(r: number): number {
      const q = r * hInv;
      if (q >= 2) return 0;
      if (q >= 1) {
        const t = 2 - q;
        return norm * 0.25 * t * t * t;
      }
      return norm * (1 - 1.5 * q * q + 0.75 * q * q * q);
    },
    gradient(r: number): number {
      const q = r * hInv;
      if (q >= 2) return 0;
      if (q >= 1) {
        const t = 2 - q;
        return -norm * 0.75 * t * t * hInv;
      }
      // d/dr [1 − (3/2)q² + (3/4)q³] · σ_3 · 1/h
      // = (−3q + (9/4)q²) · σ_3 / h
      return norm * (-3 * q + 2.25 * q * q) * hInv;
    },
  };
}
