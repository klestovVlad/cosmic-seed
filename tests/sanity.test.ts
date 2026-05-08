import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });

  it('happy-dom is available', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });
});
