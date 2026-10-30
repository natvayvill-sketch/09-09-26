import { describe, it, expect } from "vitest";
import { readMood } from "./readings";
import { DEFAULT_MOOD_SETTINGS } from "./settings";

describe("readMood", () => {
  it("a neutral face reads zero everywhere", () => {
    expect(readMood({}, 0)).toEqual({ smile: 0, frown: 0, sad: 0, shocked: 0, puzzled: 0 });
  });

  it("a full smile reads as smile only", () => {
    const r = readMood({ mouthSmileLeft: 1, mouthSmileRight: 1 }, 0);
    expect(r.smile).toBe(1);
    expect(r.frown).toBe(0);
    expect(r.sad).toBe(0);
    expect(r.shocked).toBe(0);
  });

  it("pulled-down brows read as frown, not sad", () => {
    const r = readMood({ browDownLeft: 0.6, browDownRight: 0.6 }, 0);
    expect(r.frown).toBeCloseTo(0.9);
    expect(r.sad).toBe(0);
  });

  it("droopy mouth with raised inner brows reads as sad", () => {
    const r = readMood({ mouthFrownLeft: 0.4, mouthFrownRight: 0.4, browInnerUp: 0.6 }, 0);
    expect(r.sad).toBeCloseTo(0.9);
  });

  it("talking does not read as shocked", () => {
    const r = readMood({ jawOpen: 0.5 }, 0);
    expect(r.shocked).toBeCloseTo(0.4);
    expect(r.shocked).toBeLessThan(DEFAULT_MOOD_SETTINGS.alert.on);
  });

  it("wide eyes, raised brows and open mouth read as shocked", () => {
    const r = readMood(
      {
        eyeWideLeft: 0.8,
        eyeWideRight: 0.8,
        browInnerUp: 0.8,
        browOuterUpLeft: 0.8,
        browOuterUpRight: 0.8,
        jawOpen: 0.6,
      },
      0,
    );
    expect(r.shocked).toBeGreaterThanOrEqual(0.9);
  });

  it("one raised eyebrow reads as puzzled", () => {
    expect(readMood({ browOuterUpLeft: 0.4 }, 0).puzzled).toBeCloseTo(0.8);
  });

  it("a head tilt reads as puzzled, either way", () => {
    expect(readMood({}, 0.25).puzzled).toBeCloseTo(1);
    expect(readMood({}, -0.125).puzzled).toBeCloseTo(0.5);
  });
});
