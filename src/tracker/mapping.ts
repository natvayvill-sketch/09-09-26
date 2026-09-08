import type { RawFaceInput, PoseUpdate, MappingState, Euler3 } from "./types";

export interface MappingConfig {
  /** exponential smoothing 0..1 for expressions (higher = snappier). */
  expressionSmoothing: number;
  /** snappier smoothing for blink so the eyes fully close. */
  blinkSmoothing: number;
  /** smoothing for neck/head rotation. */
  headSmoothing: number;
  /** fraction of head rotation applied to the neck bone; the rest goes to the head bone. */
  neckShare: number;
  /** clamps in radians. */
  headClampRad: { yaw: number; pitch: number; roll: number };
  /** below this faceConfidence, ease everything toward neutral. */
  confidenceFloor: number;
  /** gain multipliers so subtle expressions read on the avatar. */
  gain: { smile: number; brow: number; jawOpen: number };
  /** front camera is a mirror; negate yaw and roll so the avatar mirrors the user. */
  mirror: boolean;
}

export const DEFAULT_MAPPING_CONFIG: MappingConfig = {
  expressionSmoothing: 0.5,
  blinkSmoothing: 0.8,
  headSmoothing: 0.35,
  neckShare: 0.3,
  headClampRad: { yaw: 0.6, pitch: 0.5, roll: 0.4 },
  confidenceFloor: 0.3,
  gain: { smile: 1.3, brow: 1.5, jawOpen: 1.1 },
  mirror: true,
};

export function createMappingState(): MappingState {
  return { smoothed: {}, neck: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 } };
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

function lerpEuler(a: Euler3, b: Euler3, k: number): Euler3 {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) };
}
function scaleEuler(e: Euler3, s: number): Euler3 {
  return { x: e.x * s, y: e.y * s, z: e.z * s };
}

/** Decompose a column-major 4x4 matrix's rotation into XYZ Euler angles (radians). */
export function matrixToEuler(m: number[]): Euler3 {
  // column-major: m[col*4 + row]. Rotation basis vectors are columns 0,1,2.
  const m11 = m[0]!, m21 = m[1]!, m31 = m[2]!;
  const m12 = m[4]!, m22 = m[5]!, m32 = m[6]!;
  const m13 = m[8]!, m23 = m[9]!, m33 = m[10]!;
  // XYZ order (Three.js convention)
  const y = Math.asin(clamp(m13, -1, 1));
  let x: number;
  let z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m23, m33);
    z = Math.atan2(-m12, m11);
  } else {
    x = Math.atan2(m32, m22);
    z = 0;
  }
  return { x, y, z };
}

function clampEuler(e: Euler3, c: MappingConfig["headClampRad"]): Euler3 {
  return {
    x: clamp(e.x, -c.pitch, c.pitch),
    y: clamp(e.y, -c.yaw, c.yaw),
    z: clamp(e.z, -c.roll, c.roll),
  };
}

export function mapFaceToPose(
  raw: RawFaceInput,
  prev: MappingState,
  config: MappingConfig = DEFAULT_MAPPING_CONFIG,
): { pose: PoseUpdate; state: MappingState } {
  const faded = raw.faceConfidence < config.confidenceFloor;
  const bs = raw.blendshapes;

  const targets: Record<string, number> = {};
  if (!faded) {
    targets.blinkLeft = clamp01(bs.eyeBlinkLeft ?? 0);
    targets.blinkRight = clamp01(bs.eyeBlinkRight ?? 0);

    const jaw = clamp01((bs.jawOpen ?? 0) * config.gain.jawOpen);
    const pucker = clamp01(bs.mouthPucker ?? 0);
    const funnel = clamp01(bs.mouthFunnel ?? 0);
    const mclose = clamp01(bs.mouthClose ?? 0);
    targets.aa = clamp01(jaw * (1 - pucker));
    targets.ou = clamp01(Math.max(pucker, funnel) * 0.8);
    targets.ih = clamp01(mclose * 0.5 + jaw * 0.2);

    targets.happy = clamp01(
      (((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2) *
        config.gain.smile,
    );

    const brow = clamp01(
      (((bs.browInnerUp ?? 0) +
        (bs.browOuterUpLeft ?? 0) +
        (bs.browOuterUpRight ?? 0)) /
        3) *
        config.gain.brow,
    );
    targets.surprised = clamp01(brow * 0.6);

    // --- extension point: eye-gaze (v1: not mapped) ---
    // targets.lookLeft / lookRight / lookUp / lookDown from bs.eyeLookIn*/Out*/Up*/Down*
  }

  const nextSmoothed: Record<string, number> = { ...prev.smoothed };
  const names = new Set<string>([
    ...Object.keys(prev.smoothed),
    ...Object.keys(targets),
  ]);
  for (const name of names) {
    const target = targets[name] ?? 0;
    const current = prev.smoothed[name] ?? 0;
    const k = name.startsWith("blink")
      ? config.blinkSmoothing
      : config.expressionSmoothing;
    nextSmoothed[name] = lerp(current, target, k);
  }

  let targetEuler: Euler3 = { x: 0, y: 0, z: 0 };
  if (!faded && raw.headMatrix) {
    targetEuler = clampEuler(matrixToEuler(raw.headMatrix), config.headClampRad);
    if (config.mirror) {
      targetEuler = { x: targetEuler.x, y: -targetEuler.y, z: -targetEuler.z };
    }
  }
  const nextNeck = lerpEuler(
    prev.neck,
    scaleEuler(targetEuler, config.neckShare),
    config.headSmoothing,
  );
  const nextHead = lerpEuler(
    prev.head,
    scaleEuler(targetEuler, 1 - config.neckShare),
    config.headSmoothing,
  );

  // --- extension point: body-lean (v1: not mapped) ---
  // derive spine rotation from head translation (m[12], m[13]) here.

  return {
    pose: {
      expressionWeights: nextSmoothed,
      neckEuler: nextNeck,
      headEuler: nextHead,
    },
    state: { smoothed: nextSmoothed, neck: nextNeck, head: nextHead },
  };
}
