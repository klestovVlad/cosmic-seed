// Mass-anchor strings — the "≈ dwarf-galaxy seed" hook that turns a bare
// `10⁶ M☉` into something a non-physicist can latch onto. Required by
// EXPERIENCE.md §3 for the in-scene pins, the HUD halo card, and the
// end-of-run summary.

/** Plain-language anchor for a halo / cluster mass given in solar masses. */
export function massAnchor(mSun: number): string {
  if (!Number.isFinite(mSun) || mSun <= 0) return '';
  if (mSun < 1e5) return 'pre-galactic seed';
  if (mSun < 1e6) return '≈ globular-cluster mass';
  if (mSun < 1e7) return '≈ dwarf-galaxy seed';
  if (mSun < 1e9) return '≈ early dwarf galaxy';
  if (mSun < 1e11) return '≈ Milky-Way progenitor';
  return '≈ massive galaxy halo';
}

/** Compact M☉ formatting matching the HUD: 5.2 k M☉, 1.7 M M☉, 3.1 G M☉. */
export function formatSolarMass(mSun: number): string {
  if (!Number.isFinite(mSun) || mSun <= 0) return '—';
  if (mSun < 1e3) return `${mSun.toFixed(0)} M☉`;
  if (mSun < 1e6) return `${(mSun / 1e3).toFixed(1)} k M☉`;
  if (mSun < 1e9) return `${(mSun / 1e6).toFixed(1)} M M☉`;
  return `${(mSun / 1e9).toFixed(2)} G M☉`;
}
