// Versioned URL serialisation for the parameter store. EXPERIENCE.md §13:
// shared URLs reproduce a run exactly. Parameters that match the schema
// default are *omitted* from the URL so a fresh page link stays the
// minimum viable `?` (or empty), and so the URL doesn't accumulate noise.
//
// Schema versioning lives behind `?v=1`. When breaking schema changes
// land, bump the version and write a migrator from `v=N → v=N+1`.

import { clampValue, type ParameterKey, PARAMETER_SCHEMA, type ParameterValues } from './schema';

const SCHEMA_VERSION = '1';
const VERSION_KEY = 'v';

const URL_KEY_TO_PARAM_KEY: Record<string, ParameterKey> = (() => {
  const out: Record<string, ParameterKey> = {};
  for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
    out[PARAMETER_SCHEMA[k].urlKey] = k;
  }
  return out;
})();

/** Serialize parameters into a URL search string. Only non-default
 *  values are emitted; the schema version is included whenever there
 *  is at least one non-default parameter. */
export function serialiseParameters(values: ParameterValues, existingSearch = ''): string {
  const params = new URLSearchParams(existingSearch);

  let anyNonDefault = false;
  for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
    const spec = PARAMETER_SCHEMA[k];
    const v = values[k];
    if (v === spec.default) {
      params.delete(spec.urlKey);
      continue;
    }
    anyNonDefault = true;
    // Trim trailing zeroes in the URL serialisation: `0.220000000` →
    // `0.22`. URLSearchParams will percent-encode the result.
    params.set(spec.urlKey, formatNumber(v));
  }

  if (anyNonDefault) {
    params.set(VERSION_KEY, SCHEMA_VERSION);
  } else {
    params.delete(VERSION_KEY);
  }

  const result = params.toString();
  return result.length === 0 ? '' : `?${result}`;
}

/** Deserialise a URL search string into parameter values. Unknown keys
 *  are ignored. Schema-version mismatches drop ALL parameter values
 *  back to defaults — better to ignore an old `v=0` link than silently
 *  apply renamed keys to wrong fields. */
export function deserialiseParameters(search: string): Partial<ParameterValues> {
  const params = new URLSearchParams(search);
  const v = params.get(VERSION_KEY);
  if (v !== null && v !== SCHEMA_VERSION) return {};
  const out: Partial<ParameterValues> = {};
  for (const [urlKey, raw] of params.entries()) {
    const paramKey = URL_KEY_TO_PARAM_KEY[urlKey];
    if (paramKey === undefined) continue;
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    out[paramKey] = clampValue(paramKey, num);
  }
  return out;
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  // Up to 6 sig figs is plenty for our parameter ranges; trim trailing zeros.
  return Number(v.toPrecision(6))
    .toString()
    .replace(/(\.\d*?)0+$/u, '$1')
    .replace(/\.$/u, '');
}
