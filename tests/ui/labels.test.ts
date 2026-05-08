import { describe, expect, it } from 'vitest';
import { getLabel, getTooltip, LABELS, type LabelKey } from '@/ui/i18n/labels';

describe('label-pair registry', () => {
  it('every entry has a non-empty Expert and Explained string', () => {
    for (const key of Object.keys(LABELS) as LabelKey[]) {
      const pair = LABELS[key];
      expect(pair.expert.length, `${key} expert`).toBeGreaterThan(0);
      expect(pair.explained.length, `${key} explained`).toBeGreaterThan(0);
    }
  });

  it('getLabel returns the right register', () => {
    expect(getLabel('virialRatio', 'expert')).toBe('−T/U');
    expect(getLabel('virialRatio', 'explained')).toBe('virial ratio');
    expect(getLabel('redshift', 'expert')).toBe('z');
    expect(getLabel('redshift', 'explained')).toBe('redshift');
  });

  it('Expert and Explained may coincide for non-cryptic labels', () => {
    expect(getLabel('particles', 'expert')).toBe(getLabel('particles', 'explained'));
    expect(getLabel('step', 'expert')).toBe(getLabel('step', 'explained'));
  });

  it('getTooltip returns string when present, undefined otherwise', () => {
    expect(typeof getTooltip('virialRatio')).toBe('string');
    expect(getTooltip('particles')).toBeUndefined();
  });

  it('contains every cryptic Expert symbol called out by EXPERIENCE.md §10', () => {
    // Spot-check that the symbols a non-physicist couldn't decode without
    // the toggle each have a distinct Explained string.
    const cryptic: LabelKey[] = [
      'virialRatio',
      'momentum',
      'centralDensity',
      'peakDensity',
      'densityGrowth',
      'compressionHeating',
      'minGasTemperature',
      'peakH2Fraction',
      'redshift',
    ];
    for (const key of cryptic) {
      expect(LABELS[key].expert).not.toBe(LABELS[key].explained);
    }
  });
});
