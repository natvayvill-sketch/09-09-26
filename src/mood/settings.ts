/** Every tunable number for the mood effects, in one place. */
export interface MoodSettings {
  /** Multipliers so subtle expressions still register. */
  gain: { smile: number; frown: number; sad: number; shocked: number; puzzledBrow: number };
  /** A head tilt this far (radians, either way) reads as fully puzzled. */
  puzzledTiltRad: number;
  /** How quickly readings follow the face, ms. Higher = calmer, later. */
  smoothingMs: number;
  /** Readings below this count as a neutral face. */
  deadzone: number;
  /** How sad (after the deadzone) the face must be before rain starts. */
  rainStart: number;
  /** Stars in the full arc. */
  starCount: number;
  /** "!" and "?" turn on at `on` and off below `off`, so they don't flicker. */
  alert: { on: number; off: number };
}

export const DEFAULT_MOOD_SETTINGS: MoodSettings = {
  gain: { smile: 1.3, frown: 1.5, sad: 1.5, shocked: 1.6, puzzledBrow: 2 },
  puzzledTiltRad: 0.25,
  smoothingMs: 200,
  deadzone: 0.15,
  rainStart: 0.3,
  starCount: 7,
  alert: { on: 0.5, off: 0.35 },
};
