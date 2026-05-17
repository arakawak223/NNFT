/** Test bootstrap. The radar module uses localStorage for cross-mode
 *  bests; vitest runs in `node` env by default with no DOM, so we
 *  provide a minimal in-memory shim. Cleared before each test so
 *  storage state doesn't leak between cases. */
import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  getItem(k: string): string | null { return this.store.get(k) ?? null; }
  setItem(k: string, v: string): void { this.store.set(k, String(v)); }
  removeItem(k: string): void { this.store.delete(k); }
  clear(): void { this.store.clear(); }
}

const ls = new MemoryStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage = ls;

beforeEach(() => {
  ls.clear();
});
