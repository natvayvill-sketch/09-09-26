import type { MoodFrame, MoodReadings, MoodState } from "./types";
import { DEFAULT_MOOD_SETTINGS, type MoodSettings } from "./settings";

const NEUTRAL: MoodReadings = { smile: 0, frown: 0, sad: 0, shocked: 0, puzzled: 0 };

export function createMoodState(): MoodState {
  return { smoothed: { ...NEUTRAL }, exclaim: false, question: false, gloom: false };
}

/** Readings below the deadzone count as neutral; the rest is stretched back to 0..1. */
function beyondDeadzone(v: number, cfg: MoodSettings): number {
  return v < cfg.deadzone ? 0 : (v - cfg.deadzone) / (1 - cfg.deadzone);
}

/**
 * Which side holds the background. The other side has to beat it by a margin
 * to take over (so near-equal readings don't flicker), unless it's showing nothing.
 */
function holdsGloom(wasGloom: boolean, s: MoodReadings, cfg: MoodSettings): boolean {
  const pos = beyondDeadzone(s.smile, cfg);
  const neg = beyondDeadzone(Math.max(s.frown, s.sad), cfg);
  if (wasGloom) return !(pos > neg + cfg.winnerMargin || (neg === 0 && pos > 0));
  return neg > pos + cfg.winnerMargin || (pos === 0 && neg > 0);
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
    gloom: holdsGloom(prev.gloom, smoothed, cfg),
  };
}

/** Decides what's on screen: whichever of smile and frown/sad holds the background. */
export function moodFrame(state: MoodState, cfg: MoodSettings = DEFAULT_MOOD_SETTINGS): MoodFrame {
  const d = (v: number): number => beyondDeadzone(v, cfg);
  const { smile, frown, sad } = state.smoothed;
  const pos = d(smile);
  const neg = d(Math.max(frown, sad));
  const alerts = { exclaim: state.exclaim, question: state.question };
  if (!state.gloom) {
    return { light: pos, stars: Math.ceil(pos * cfg.starCount), clouds: 0, rain: 0, ...alerts };
  }
  const sadness = d(sad);
  const rain = sadness > cfg.rainStart ? (sadness - cfg.rainStart) / (1 - cfg.rainStart) : 0;
  return { light: 0, stars: 0, clouds: neg, rain, ...alerts };
}
