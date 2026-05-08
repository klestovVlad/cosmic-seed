// Expert/Explained mode URL persistence (EXPERIENCE.md §10, §13).
//
//   * URL query string `?x=1` ⇒ Expert; `?x=0` or absent ⇒ Explained.
//   * localStorage key `cs.expertMode` mirrors the URL so the next
//     visit (where the URL doesn't carry the flag) remembers the
//     user's last choice.
//   * URL takes precedence on initial load so a shared link enforces
//     the sender's register.
//
// Pure module — no React. Components hook the URL ↔ store sync via a
// thin effect mounted at the app root.

const PARAM = 'x';
const STORAGE_KEY = 'cs.expertMode';

export function readExpertModeFromUrl(search: string): boolean | null {
  const params = new URLSearchParams(search);
  const raw = params.get(PARAM);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function writeExpertModeToUrlString(search: string, expertMode: boolean): string {
  const params = new URLSearchParams(search);
  // Store only when the value diverges from the default (Explained).
  // Keeps shared URLs minimal — most users never opt into Expert.
  if (expertMode) params.set(PARAM, '1');
  else params.delete(PARAM);
  const result = params.toString();
  return result.length === 0 ? '' : `?${result}`;
}

export function readExpertModeFromStorage(storage: Storage | null): boolean | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  } catch {
    return null;
  }
}

export function writeExpertModeToStorage(storage: Storage | null, expertMode: boolean): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, expertMode ? '1' : '0');
  } catch {
    // Quota-exceeded / private mode — silent fail; URL is still authoritative.
  }
}

/**
 * Resolve the initial expert-mode value at app startup. URL wins
 * (shared link semantics), then localStorage, then default Explained.
 */
export function resolveInitialExpertMode(args: {
  readonly urlSearch: string;
  readonly storage: Storage | null;
}): boolean {
  const fromUrl = readExpertModeFromUrl(args.urlSearch);
  if (fromUrl !== null) return fromUrl;
  const fromStorage = readExpertModeFromStorage(args.storage);
  if (fromStorage !== null) return fromStorage;
  return false;
}
