import type { HeadAnchor, Spot } from "./types";

/** Degrees from straight up, centre first, then alternating outwards. */
const STAR_ANGLES = [0, -25, 25, -50, 50, -75, 75];

/**
 * The star arc around the head, centre-first: show the first N spots, so the
 * outer stars are the last to come out and the first to go back.
 */
export function starArc(anchor: HeadAnchor, total: number): Spot[] {
  const r = anchor.size * 0.85;
  return STAR_ANGLES.slice(0, total).map((deg) => {
    const a = (deg * Math.PI) / 180 + anchor.roll;
    return { x: anchor.x + Math.sin(a) * r, y: anchor.y - Math.cos(a) * r };
  });
}

/** Above the head: one alert is centred, two sit side by side as "!?". */
export function alertSpots(
  anchor: HeadAnchor,
  exclaim: boolean,
  question: boolean,
): { exclaim?: Spot; question?: Spot } {
  const y = anchor.y - anchor.size * 0.75;
  const gap = exclaim && question ? anchor.size * 0.175 : 0;
  return {
    ...(exclaim ? { exclaim: { x: anchor.x - gap, y } } : {}),
    ...(question ? { question: { x: anchor.x + gap, y } } : {}),
  };
}

/**
 * A cloud's centre x: fully outside the visible area (the stage plus `spill`)
 * at strength 0, reaching the back of the head at strength 1.
 */
export function cloudX(
  strength: number,
  side: "left" | "right",
  anchor: HeadAnchor,
  cloudW: number,
  spill: number,
): number {
  const outside = side === "left" ? -spill - cloudW / 2 : 1 + spill + cloudW / 2;
  const inside = side === "left" ? anchor.x - anchor.size * 0.6 : anchor.x + anchor.size * 0.6;
  return outside + (inside - outside) * strength;
}
