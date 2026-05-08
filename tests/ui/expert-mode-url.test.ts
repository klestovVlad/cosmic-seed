import { describe, expect, it } from 'vitest';
import {
  readExpertModeFromStorage,
  readExpertModeFromUrl,
  resolveInitialExpertMode,
  writeExpertModeToStorage,
  writeExpertModeToUrlString,
} from '@/ui/i18n/expert-mode-url';

describe('expert-mode URL parsing', () => {
  it('reads `?x=1` as Expert and `?x=0` as Explained', () => {
    expect(readExpertModeFromUrl('?x=1')).toBe(true);
    expect(readExpertModeFromUrl('?x=0')).toBe(false);
  });

  it('returns null when the parameter is absent or malformed', () => {
    expect(readExpertModeFromUrl('')).toBeNull();
    expect(readExpertModeFromUrl('?x=2')).toBeNull();
    expect(readExpertModeFromUrl('?seed=42')).toBeNull();
  });

  it('preserves other parameters when writing', () => {
    expect(writeExpertModeToUrlString('?seed=42', true)).toBe('?seed=42&x=1');
    expect(writeExpertModeToUrlString('?seed=42&x=1', false)).toBe('?seed=42');
  });

  it('omits the parameter for the default register (Explained) — keeps shared URLs minimal', () => {
    expect(writeExpertModeToUrlString('', false)).toBe('');
    expect(writeExpertModeToUrlString('?x=1', false)).toBe('');
  });

  it('round-trips Expert ↔ Explained without losing other params', () => {
    const url = writeExpertModeToUrlString('?seed=42&v=1', true);
    expect(readExpertModeFromUrl(url)).toBe(true);
    const back = writeExpertModeToUrlString(url, false);
    expect(readExpertModeFromUrl(back)).toBeNull(); // omitted ⇒ default Explained
  });
});

class MemoryStorage {
  private readonly store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? (this.store.get(k) ?? null) : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.store.size;
  }
}

describe('expert-mode storage round-trip', () => {
  it('writes and reads cleanly', () => {
    const s = new MemoryStorage() as unknown as Storage;
    writeExpertModeToStorage(s, true);
    expect(readExpertModeFromStorage(s)).toBe(true);
    writeExpertModeToStorage(s, false);
    expect(readExpertModeFromStorage(s)).toBe(false);
  });

  it('returns null when storage is missing', () => {
    expect(readExpertModeFromStorage(null)).toBeNull();
  });
});

describe('resolveInitialExpertMode precedence', () => {
  it('URL beats storage beats default', () => {
    const s = new MemoryStorage() as unknown as Storage;
    writeExpertModeToStorage(s, true);

    // URL says 0 → wins.
    expect(resolveInitialExpertMode({ urlSearch: '?x=0', storage: s })).toBe(false);
    // URL absent → storage wins.
    expect(resolveInitialExpertMode({ urlSearch: '', storage: s })).toBe(true);
    // URL absent + storage empty → default Explained.
    const empty = new MemoryStorage() as unknown as Storage;
    expect(resolveInitialExpertMode({ urlSearch: '', storage: empty })).toBe(false);
    // URL absent + no storage → default Explained.
    expect(resolveInitialExpertMode({ urlSearch: '', storage: null })).toBe(false);
  });
});
