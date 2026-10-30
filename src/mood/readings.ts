import type { MoodReadings } from "./types";
import { DEFAULT_MOOD_SETTINGS, type MoodSettings } from "./settings";

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Turns MediaPipe blendshapes (ARKit names, 0..1) and the head's roll into
 * how strongly each feeling shows. Missing blendshapes count as 0.
 */
export function readMood(
  bs: Record<string, number>,
  headRollRad: number,
  cfg: MoodSettings = DEFAULT_MOOD_SETTINGS,
): MoodReadings {
  const v = (name: string): number => bs[name] ?? 0;
  const avg = (...names: string[]): number =>
    names.reduce((sum, n) => sum + v(n), 0) / names.length;

  const outerBrows = avg("browOuterUpLeft", "browOuterUpRight");
  const browsUp = avg("browInnerUp", "browOuterUpLeft", "browOuterUpRight");

  return {
    smile: clamp01(avg("mouthSmileLeft", "mouthSmileRight") * cfg.gain.smile),
    frown: clamp01(avg("browDownLeft", "browDownRight") * cfg.gain.frown),
    // Inner brows raised *above* the outer ones is the sad look; all brows up is surprise.
    sad: clamp01(
      avg("mouthFrownLeft", "mouthFrownRight") * cfg.gain.sad +
        Math.max(0, v("browInnerUp") - outerBrows) * 0.5,
    ),
    // The jaw alone only gets half way, so talking doesn't read as shock.
    shocked: clamp01(
      (((avg("eyeWideLeft", "eyeWideRight") + browsUp) / 2 + v("jawOpen")) / 2) *
        cfg.gain.shocked,
    ),
    puzzled: clamp01(
      Math.max(
        Math.abs(v("browOuterUpLeft") - v("browOuterUpRight")) * cfg.gain.puzzledBrow,
        Math.abs(headRollRad) / cfg.puzzledTiltRad,
      ),
    ),
  };
}
