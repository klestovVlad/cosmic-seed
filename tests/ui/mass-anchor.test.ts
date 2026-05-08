import { describe, expect, it } from 'vitest';
import { formatSolarMass, massAnchor } from '@/ui/mass-anchor';

describe('massAnchor', () => {
  it('returns relatable strings for the EXPERIENCE.md §3 mass buckets', () => {
    expect(massAnchor(5e4)).toBe('pre-galactic seed');
    expect(massAnchor(5e5)).toBe('≈ globular-cluster mass');
    expect(massAnchor(5e6)).toBe('≈ dwarf-galaxy seed');
    expect(massAnchor(5e8)).toBe('≈ early dwarf galaxy');
    expect(massAnchor(5e10)).toBe('≈ Milky-Way progenitor');
    expect(massAnchor(5e11)).toBe('≈ massive galaxy halo');
  });

  it('returns an empty string for non-finite or non-positive input', () => {
    expect(massAnchor(0)).toBe('');
    expect(massAnchor(-1)).toBe('');
    expect(massAnchor(Number.NaN)).toBe('');
    expect(massAnchor(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('formatSolarMass', () => {
  it('formats sub-thousand masses without a unit prefix', () => {
    expect(formatSolarMass(42)).toBe('42 M☉');
  });

  it('uses k / M / G prefixes at the right thresholds', () => {
    expect(formatSolarMass(5_500)).toBe('5.5 k M☉');
    expect(formatSolarMass(2_300_000)).toBe('2.3 M M☉');
    expect(formatSolarMass(7_400_000_000)).toBe('7.40 G M☉');
  });

  it('returns an em-dash for non-finite or non-positive', () => {
    expect(formatSolarMass(0)).toBe('—');
    expect(formatSolarMass(-1)).toBe('—');
    expect(formatSolarMass(Number.NaN)).toBe('—');
  });
});
