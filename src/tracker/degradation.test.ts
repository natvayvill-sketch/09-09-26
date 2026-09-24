import { describe, it, expect, vi } from "vitest";
import { pickTier, FrameRateWatchdog } from "./degradation";
import type { DeviceSignals } from "./types";

function signals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    hardwareConcurrency: 12,
    deviceMemoryGb: 16,
    maxViewportPx: 1920,
    coarsePointer: false,
    ...overrides,
  };
}

describe("pickTier", () => {
  it("returns strong for a capable desktop", () => {
    expect(pickTier(signals())).toBe("strong");
  });
  it("returns weak when the pointer is coarse (touch device)", () => {
    expect(pickTier(signals({ coarsePointer: true }))).toBe("weak");
  });
  it("returns weak for low core counts", () => {
    expect(pickTier(signals({ hardwareConcurrency: 4 }))).toBe("weak");
  });
  it("returns weak for a small viewport", () => {
    expect(pickTier(signals({ maxViewportPx: 800 }))).toBe("weak");
  });
  it("returns weak for low device memory", () => {
    expect(pickTier(signals({ deviceMemoryGb: 4 }))).toBe("weak");
  });
  it("ignores null device memory", () => {
    expect(pickTier(signals({ deviceMemoryGb: null }))).toBe("strong");
  });
});

describe("FrameRateWatchdog", () => {
  it("fires once after fps stays below the floor for the sustained window", () => {
    const cb = vi.fn();
    const wd = new FrameRateWatchdog({ fpsFloor: 12, sustainedMs: 5000 }, cb);
    wd.sample(8, 0);
    wd.sample(8, 3000);
    expect(cb).not.toHaveBeenCalled();
    wd.sample(8, 5001);
    expect(cb).toHaveBeenCalledTimes(1);
    wd.sample(8, 8000);
    expect(cb).toHaveBeenCalledTimes(1); // does not fire again
  });

  it("resets the timer when fps recovers above the floor", () => {
    const cb = vi.fn();
    const wd = new FrameRateWatchdog({ fpsFloor: 12, sustainedMs: 5000 }, cb);
    wd.sample(8, 0);
    wd.sample(30, 3000); // recovered
    wd.sample(8, 6000); // window restarts here
    wd.sample(8, 9000);
    expect(cb).not.toHaveBeenCalled();
    wd.sample(8, 11001);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("stays quiet after reset() until the window elapses again", () => {
    const cb = vi.fn();
    const wd = new FrameRateWatchdog({ fpsFloor: 12, sustainedMs: 5000 }, cb);
    wd.sample(8, 0);
    wd.sample(8, 6000);
    expect(cb).toHaveBeenCalledTimes(1);
    wd.reset();
    wd.sample(8, 7000);
    wd.sample(8, 11000);
    expect(cb).toHaveBeenCalledTimes(1);
    wd.sample(8, 12001);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
