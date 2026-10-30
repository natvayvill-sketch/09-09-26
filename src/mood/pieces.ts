/**
 * The mood effect sprites. Each lives in public/mood/<id>.png: one horizontal
 * strip of frameSize×frameSize pixel-art frames (frame count = width ÷ height).
 */
export type PieceId = "light" | "star" | "cloud" | "drop" | "exclaim" | "question";

export interface PieceDef {
  id: PieceId;
  frameSize: number;
  /** Frames per second for looping strips. */
  fps: number;
}

export const PIECES: Record<PieceId, PieceDef> = {
  light: { id: "light", frameSize: 64, fps: 2 },
  star: { id: "star", frameSize: 16, fps: 6 },
  cloud: { id: "cloud", frameSize: 48, fps: 2 },
  drop: { id: "drop", frameSize: 8, fps: 1 },
  exclaim: { id: "exclaim", frameSize: 16, fps: 4 },
  question: { id: "question", frameSize: 16, fps: 4 },
};

export function pieceUrl(id: PieceId): string {
  return `/mood/${id}.png`;
}
