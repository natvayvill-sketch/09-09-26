import type { DeviceSignals, QualityTier } from "./types";

export function pickTier(signals: DeviceSignals): QualityTier {
  if (signals.coarsePointer) return "weak";
  if (signals.hardwareConcurrency <= 4) return "weak";
  if (signals.maxViewportPx < 900) return "weak";
  if (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4) {
    return "weak";
  }
  return "strong";
}

export interface WatchdogOptions {
  fpsFloor: number;
  sustainedMs: number;
}

export class FrameRateWatchdog {
  private belowSince: number | null = null;
  private fired = false;

  constructor(
    private readonly opts: WatchdogOptions,
    private readonly onStruggling: () => void,
  ) {}

  sample(fps: number, nowMs: number): void {
    if (this.fired) return;
    if (fps < this.opts.fpsFloor) {
      if (this.belowSince === null) {
        this.belowSince = nowMs;
      } else if (nowMs - this.belowSince >= this.opts.sustainedMs) {
        this.fired = true;
        this.onStruggling();
      }
    } else {
      this.belowSince = null;
    }
  }

  reset(): void {
    this.belowSince = null;
    this.fired = false;
  }
}

/** Browser-reading. Not unit-tested. */
export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    hardwareConcurrency: nav.hardwareConcurrency ?? 2,
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    maxViewportPx: Math.max(window.innerWidth, window.innerHeight),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

/** Browser-reading. Not unit-tested. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (gl) {
      // release the probe context immediately; browsers cap live WebGL contexts
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
