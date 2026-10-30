/** How strongly each feeling shows on the visitor's face, each 0..1. */
export interface MoodReadings {
  smile: number;
  /** Brows pulled down and together. */
  frown: number;
  /** Mouth corners down, inner brows raised. */
  sad: number;
  /** Eyes wide, brows up, mouth dropping open. */
  shocked: number;
  /** One eyebrow higher than the other, or a head tilt. */
  puzzled: number;
}

/** Smoothed readings plus the on/off state of the "!" and "?". */
export interface MoodState {
  smoothed: MoodReadings;
  exclaim: boolean;
  question: boolean;
}

/** What to show this frame. */
export interface MoodFrame {
  /** Warm light behind the head, 0..1. */
  light: number;
  /** How many stars of the arc are out, 0..starCount. */
  stars: number;
  /** How far in and how dark the clouds are, 0..1. */
  clouds: number;
  /** How heavy the rain is, 0..1. */
  rain: number;
  exclaim: boolean;
  question: boolean;
}
