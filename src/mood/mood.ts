import type { MoodFrame, MoodReadings, MoodState } from "./types";
import { DEFAULT_MOOD_SETTINGS, type MoodSettings } from "./settings";

const NEUTRAL: MoodReadings = { smile: 0, frown: 0, sad: 0, shocked: 0, puzzled: 0 };

export function createMoodState(): MoodState {
  return { smoothed: { ...NEUTRAL }, exclaim: false, question: false };
}

/** On at `on`, off below `off`, otherwise unchanged. */
function latch(was: boolean, value: number, cfg: MoodSettings["alert"]): boolean {
  if (value >= cfg.on) return true;
  if (value < cfg.off) return false;
  return was;
}

/**
 * Eases the readings towards the face (null = no face: towards neutral) and
 * updates the "!" / "?" switches.
 */
export function stepMood(
  prev: MoodState,
  readings: MoodReadings | null,
  dtMs: number,
  cfg: MoodSettings = DEFAULT_MOOD_SETTINGS,
): MoodState {
  const target = readings ?? NEUTRAL;
  const k = 1 - Math.exp(-dtMs / cfg.smoothingMs);
  const smoothed = { ...prev.smoothed };
  for (const key of Object.keys(NEUTRAL) as (keyof MoodReadings)[]) {
    smoothed[key] += (target[key] - smoothed[key]) * k;
  }
  return {
    smoothed,
    exclaim: latch(prev.exclaim, smoothed.shocked, cfg.alert),
    question: latch(prev.question, smoothed.puzzled, cfg.alert),
  };
}

/** Decides what's on screen: the stronger of smile and frown/sad wins the background. */
export function moodFrame(state: MoodState, cfg: MoodSettings = DEFAULT_MOOD_SETTINGS): MoodFrame {
  const d = (v: number): number => (v < cfg.deadzone ? 0 : (v - cfg.deadzone) / (1 - cfg.deadzone));
  const { smile, frown, sad } = state.smoothed;
  const pos = d(smile);
  const neg = d(Math.max(frown, sad));
  const alerts = { exclaim: state.exclaim, question: state.question };
  if (pos > neg) {
    return { light: pos, stars: Math.ceil(pos * cfg.starCount), clouds: 0, rain: 0, ...alerts };
  }
  const sadness = d(sad);
  const rain = sadness > cfg.rainStart ? (sadness - cfg.rainStart) / (1 - cfg.rainStart) : 0;
  return { light: 0, stars: 0, clouds: neg, rain, ...alerts };
}
