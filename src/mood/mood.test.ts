import { describe, it, expect } from "vitest";
import { createMoodState, moodFrame, stepMood } from "./mood";
import type { MoodReadings, MoodState } from "./types";

const neutral: MoodReadings = { smile: 0, frown: 0, sad: 0, shocked: 0, puzzled: 0 };
const face = (r: Partial<MoodReadings>): MoodReadings => ({ ...neutral, ...r });

/** Steps the state in 16 ms frames until the readings have settled. */
function settle(readings: MoodReadings | null, ms = 3000, from: MoodState = createMoodState()): MoodState {
  let s = from;
  for (let t = 0; t < ms; t += 16) s = stepMood(s, readings, 16);
  return s;
}

describe("moodFrame", () => {
  it("a neutral face shows nothing", () => {
    expect(moodFrame(settle(neutral))).toEqual({
      light: 0,
      stars: 0,
      clouds: 0,
      rain: 0,
      exclaim: false,
      question: false,
    });
  });

  it("a small smile brings out the centre star only, a big one brings out all 7", () => {
    expect(moodFrame(settle(face({ smile: 0.25 }))).stars).toBe(1);
    const big = moodFrame(settle(face({ smile: 1 })));
    expect(big.stars).toBe(7);
    expect(big.light).toBeCloseTo(1);
  });

  it("a frown brings clouds but no rain", () => {
    const f = moodFrame(settle(face({ frown: 0.8 })));
    expect(f.clouds).toBeGreaterThan(0.7);
    expect(f.rain).toBe(0);
  });

  it("only sad makes it rain, from a cloud", () => {
    const f = moodFrame(settle(face({ sad: 0.9 })));
    expect(f.clouds).toBeGreaterThan(0.8);
    expect(f.rain).toBeGreaterThan(0.5);
  });

  it("smile and frown together: the stronger one wins, never stars with rain", () => {
    const happier = moodFrame(settle(face({ smile: 0.9, sad: 0.5 })));
    expect(happier.stars).toBeGreaterThan(0);
    expect(happier.rain).toBe(0);
    const sadder = moodFrame(settle(face({ smile: 0.3, sad: 0.9 })));
    expect(sadder.stars).toBe(0);
    expect(sadder.rain).toBeGreaterThan(0);
  });
});

describe("background winner", () => {
  it("a close smile-versus-frown doesn't flip the background", () => {
    let s = settle(face({ smile: 0.5 }));
    s = settle(face({ smile: 0.5, frown: 0.55 }), 3000, s);
    const f = moodFrame(s);
    expect(f.stars).toBeGreaterThan(0);
    expect(f.clouds).toBe(0);
  });

  it("a clearly stronger frown takes over from a smile", () => {
    let s = settle(face({ smile: 0.5 }));
    s = settle(face({ smile: 0.5, frown: 0.7 }), 3000, s);
    expect(moodFrame(s).clouds).toBeGreaterThan(0);
    expect(moodFrame(s).stars).toBe(0);
  });

  it("from a neutral face, even a small frown brings clouds", () => {
    expect(moodFrame(settle(face({ frown: 0.3 }))).clouds).toBeGreaterThan(0);
  });
});

describe("stepMood", () => {
  it("alerts don't flicker between thresholds", () => {
    let s = settle(face({ shocked: 0.6 }));
    expect(s.exclaim).toBe(true);
    s = settle(face({ shocked: 0.4 }), 3000, s);
    expect(s.exclaim).toBe(true);
    s = settle(face({ shocked: 0.3 }), 3000, s);
    expect(s.exclaim).toBe(false);
    s = settle(face({ shocked: 0.4 }), 3000, s);
    expect(s.exclaim).toBe(false);
  });

  it("! and ? can both be on", () => {
    const f = moodFrame(settle(face({ shocked: 0.8, puzzled: 0.8 })));
    expect(f.exclaim).toBe(true);
    expect(f.question).toBe(true);
  });

  it("null readings (no face) fade everything back to empty", () => {
    const happy = settle(face({ smile: 1, shocked: 1 }));
    expect(moodFrame(settle(null, 3000, happy))).toEqual(moodFrame(createMoodState()));
  });

  it("reacts a beat late, not instantly", () => {
    const s = stepMood(createMoodState(), face({ smile: 1 }), 16);
    expect(s.smoothed.smile).toBeLessThan(0.15);
  });
});
