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
