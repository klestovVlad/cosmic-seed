import { describe, expect, it } from 'vitest';
import {
  clampValue,
  defaultValues,
  type ParameterKey,
  PARAMETER_SCHEMA,
} from '@/state/parameters/schema';
import { deserialiseParameters, serialiseParameters } from '@/state/parameters/url';
import { LABELS } from '@/ui/i18n/labels';

describe('PARAMETER_SCHEMA', () => {
  it('every parameter has a registered label-pair', () => {
    for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
      const labelKey = PARAMETER_SCHEMA[k].labelKey;
      expect(LABELS[labelKey], `${k}.labelKey="${labelKey}" must exist in LABELS`).toBeDefined();
    }
  });

  it('every parameter has a unique URL key', () => {
    const seen = new Set<string>();
    for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
      const u = PARAMETER_SCHEMA[k].urlKey;
      expect(seen.has(u), `duplicate urlKey "${u}"`).toBe(false);
      seen.add(u);
    }
  });

  it('default values fall inside [min, max]', () => {
    for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
      const spec = PARAMETER_SCHEMA[k];
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
    }
  });
});

describe('clampValue', () => {
  it('clamps to min and max', () => {
    expect(clampValue('sigma8', -10)).toBe(PARAMETER_SCHEMA.sigma8.min);
    expect(clampValue('sigma8', 10)).toBe(PARAMETER_SCHEMA.sigma8.max);
  });

  it('rounds integer parameters', () => {
    expect(clampValue('maxStars', 3.7)).toBe(4);
    expect(clampValue('maxStars', -1)).toBe(0);
  });

  it('snaps number parameters to their step grid', () => {
    // sigma8.step = 0.01; 0.123 should snap to 0.12.
    const snapped = clampValue('sigma8', 0.123);
    expect(snapped).toBeCloseTo(0.12, 6);
  });

  it('falls back to default for non-finite input', () => {
    expect(clampValue('sigma8', Number.NaN)).toBe(PARAMETER_SCHEMA.sigma8.default);
  });
});

describe('URL round-trip', () => {
  it('omits parameters at their default — empty URL for the fresh-page case', () => {
    expect(serialiseParameters(defaultValues())).toBe('');
  });

  it('round-trips non-default values with the schema version', () => {
    const values = { ...defaultValues(), sigma8: 0.5, ignitionJ_LW: 100 };
    const url = serialiseParameters(values);
    expect(url).toContain('s8=0.5');
    expect(url).toContain('jlw=100');
    expect(url).toContain('v=1');
    const back = deserialiseParameters(url);
    expect(back.sigma8).toBeCloseTo(0.5, 6);
    expect(back.ignitionJ_LW).toBe(100);
  });

  it('preserves unrelated query parameters when serialising', () => {
    const url = serialiseParameters(
      { ...defaultValues(), ignitionJ_LW: 50 },
      '?x=1&utm_source=twitter',
    );
    expect(url).toContain('x=1');
    expect(url).toContain('utm_source=twitter');
    expect(url).toContain('jlw=50');
  });

  it('drops everything when the schema version is wrong', () => {
    expect(deserialiseParameters('?v=99&s8=0.5&jlw=100')).toEqual({});
  });

  it('ignores unknown URL keys', () => {
    const out = deserialiseParameters('?v=1&s8=0.5&unknown=42');
    expect(out.sigma8).toBeCloseTo(0.5, 6);
    expect(Object.keys(out).length).toBe(1);
  });

  it('clamps deserialised values to schema bounds', () => {
    // jlw max is 1000 — a URL with jlw=99999 should clamp.
    const out = deserialiseParameters('?v=1&jlw=99999');
    expect(out.ignitionJ_LW).toBe(PARAMETER_SCHEMA.ignitionJ_LW.max);
  });
});
