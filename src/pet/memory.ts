export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type GetStore = () => StorageLike;

const LAST_ERA_KEY = "pet:last-era";
const HIDDEN_KEY = "pet:hidden";

// Merely touching window.localStorage can throw (blocked site data), so the
// stores are fetched lazily, inside the try.
const local: GetStore = () => window.localStorage;
const session: GetStore = () => window.sessionStorage;

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function readLastEra(getStore: GetStore = local): string | null {
  return safely(() => getStore().getItem(LAST_ERA_KEY), null);
}

export function writeLastEra(era: string, getStore: GetStore = local): void {
  safely(() => getStore().setItem(LAST_ERA_KEY, era), undefined);
}

/** Dismissed for this visit only, hence sessionStorage. */
export function readHidden(getStore: GetStore = session): boolean {
  return safely(() => getStore().getItem(HIDDEN_KEY) === "1", false);
}

export function writeHidden(hidden: boolean, getStore: GetStore = session): void {
  safely(() => {
    const store = getStore();
    if (hidden) store.setItem(HIDDEN_KEY, "1");
    else store.removeItem(HIDDEN_KEY);
  }, undefined);
}
