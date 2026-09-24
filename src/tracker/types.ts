/** One MediaPipe FaceLandmarker detection, normalized for our use. */
export interface RawFaceInput {
  /** ARKit-style blendshape name -> coefficient 0..1. Empty object when no face. */
  blendshapes: Record<string, number>;
  /** 16-number 4x4 facial transformation matrix (MediaPipe's column-major order), or null when no face. */
  headMatrix: number[] | null;
  /** 1 when a face was detected this frame, 0 otherwise. */
  faceConfidence: number;
}

/** Euler angles, radians. */
export interface Euler3 {
  x: number;
  y: number;
  z: number;
}

/** What the avatar should look like for one frame. */
export interface PoseUpdate {
  /** VRM expression name -> weight 0..1, e.g. { blinkLeft: 0.9, aa: 0.3, happy: 0.1 }. */
  expressionWeights: Record<string, number>;
  neckEuler: Euler3;
  headEuler: Euler3;
}

/** Per-value smoothing history threaded between frames. Opaque to callers. */
export interface MappingState {
  smoothed: Record<string, number>;
  neck: Euler3;
  head: Euler3;
}

export type QualityTier = "strong" | "weak";

export interface DeviceSignals {
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
  maxViewportPx: number;
  coarsePointer: boolean;
}

export type TrackerStateName =
  | "intro"
  | "requesting"
  | "denied"
  | "loading"
  | "running"
  | "struggling"
  | "paused"
  | "stopped"
  | "error"
  | "unsupported";

export type UnsupportedReason = "no-webgl2" | "weak-device";

export interface TrackerState {
  name: TrackerStateName;
  unsupportedReason?: UnsupportedReason;
  /** Set once the visitor clicks "keep going anyway" on the struggling screen. */
  suppressStruggling: boolean;
}

export type TrackerEvent =
  | { type: "START" }
  | { type: "PERMISSION_GRANTED" }
  | { type: "PERMISSION_DENIED" }
  | { type: "LOAD_OK" }
  | { type: "LOAD_FAILED" }
  | { type: "FPS_LOW" }
  | { type: "KEEP_GOING" }
  | { type: "STOP" }
  | { type: "HIDDEN" }
  | { type: "UNSUPPORTED"; reason: UnsupportedReason };

/** Side effects the imperative shell performs after a transition. */
export type TrackerEffect =
  | "request-camera"
  | "load-models"
  | "start-loop"
  | "stop-loop"
  | "release-camera";
