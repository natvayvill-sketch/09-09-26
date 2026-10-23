import { describe, it, expect } from "vitest";
import { readHidden, readLastEra, writeHidden, writeLastEra, type StorageLike } from "./memory";

class FakeStore implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const blocked = (): StorageLike => {
  throw new Error("SecurityError: storage is disabled");
};
const broken: StorageLike = {
  getItem: () => {
    throw new Error("broken");
  },
  setItem: () => {
    throw new Error("broken");
  },
  removeItem: () => {
    throw new Error("broken");
  },
};

describe("last era", () => {
  it("round-trips the last era", () => {
    const store = new FakeStore();
    writeLastEra("The Age of Man", () => store);
    expect(readLastEra(() => store)).toBe("The Age of Man");
  });

  it("returns null when nothing is saved", () => {
    expect(readLastEra(() => new FakeStore())).toBeNull();
  });

  it("returns null when storage throws", () => {
    expect(readLastEra(blocked)).toBeNull();
    expect(readLastEra(() => broken)).toBeNull();
  });

  it("doesn't throw when saving fails", () => {
    expect(() => writeLastEra("The Rapture", blocked)).not.toThrow();
    expect(() => writeLastEra("The Rapture", () => broken)).not.toThrow();
  });
});

describe("dismissed pet", () => {
  it("round-trips hidden and clears it again", () => {
    const store = new FakeStore();
    writeHidden(true, () => store);
    expect(readHidden(() => store)).toBe(true);
    writeHidden(false, () => store);
    expect(readHidden(() => store)).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it("returns false when storage throws", () => {
    expect(readHidden(blocked)).toBe(false);
    expect(readHidden(() => broken)).toBe(false);
  });

  it("doesn't throw when saving fails", () => {
    expect(() => writeHidden(true, blocked)).not.toThrow();
  });
});
