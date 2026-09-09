import { describe, it, expect } from "vitest";
import {
  createMappingState,
  mapFaceToPose,
  matrixToEuler,
  DEFAULT_MAPPING_CONFIG,
} from "./mapping";
import type { RawFaceInput } from "./types";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function face(overrides: Partial<RawFaceInput> = {}): RawFaceInput {
  return {
    blendshapes: {},
    headMatrix: IDENTITY,
    faceConfidence: 1,
    ...overrides,
  };
}

describe("matrixToEuler", () => {
  it("returns zero rotation for the identity matrix", () => {
    const e = matrixToEuler(IDENTITY);
    expect(e.x).toBeCloseTo(0, 5);
    expect(e.y).toBeCloseTo(0, 5);
    expect(e.z).toBeCloseTo(0, 5);
  });

  it("decodes a +90 degree yaw (rotation about Y)", () => {
    // column-major rotation of +PI/2 about Y
    const c = Math.cos(Math.PI / 2);
    const s = Math.sin(Math.PI / 2);
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    const e = matrixToEuler(m);
    expect(Math.abs(e.y)).toBeCloseTo(Math.PI / 2, 4);
  });

  it("decodes signed pitch (rotation about X) and roll (about Z)", () => {
    // column-major +0.3 rad about X
    const cx = Math.cos(0.3), sx = Math.sin(0.3);
    const mx = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];
    const ex = matrixToEuler(mx);
    expect(ex.x).toBeCloseTo(0.3, 3);

    // column-major +0.2 rad about Z
    const cz = Math.cos(0.2), sz = Math.sin(0.2);
    const mz = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const ez = matrixToEuler(mz);
    expect(ez.z).toBeCloseTo(0.2, 3);
  });

  it("mirror negates yaw and roll of the head pose", () => {
    const cfg = { ...DEFAULT_MAPPING_CONFIG };
    const cy = Math.cos(0.3), sy = Math.sin(0.3);
    const m = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
    const notMirrored = mapFaceToPose(
      face({ headMatrix: m }), createMappingState(), { ...cfg, mirror: false },
    );
    const mirrored = mapFaceToPose(
      face({ headMatrix: m }), createMappingState(), { ...cfg, mirror: true },
    );
    // opposite sign on y (yaw); same magnitude
    expect(Math.sign(mirrored.pose.headEuler.y)).toBe(-Math.sign(notMirrored.pose.headEuler.y));
    expect(Math.abs(mirrored.pose.headEuler.y)).toBeCloseTo(
      Math.abs(notMirrored.pose.headEuler.y), 6,
    );
  });
});

describe("mapFaceToPose - blink", () => {
  it("drives blinkLeft/blinkRight from eyeBlink blendshapes, snappily", () => {
    let state = createMappingState();
    // one frame of a full blink
    const r = mapFaceToPose(
      face({ blendshapes: { eyeBlinkLeft: 1, eyeBlinkRight: 1 } }),
      state,
    );
    // blink uses blinkSmoothing (0.8), so after one frame it is already most of the way
    expect(r.pose.expressionWeights.blinkLeft).toBeGreaterThan(0.7);
    expect(r.pose.expressionWeights.blinkRight).toBeGreaterThan(0.7);
    // combined key for minimal rigs that only expose `blink`
    expect(r.pose.expressionWeights.blink).toBeGreaterThan(0.7);
  });
});

describe("mapFaceToPose - smile and brow", () => {
  it("maps mouthSmile to happy and browUp to surprised, with gain", () => {
    const state = createMappingState();
    const r = mapFaceToPose(
      face({
        blendshapes: {
          mouthSmileLeft: 0.5,
          mouthSmileRight: 0.5,
          browInnerUp: 0.4,
          browOuterUpLeft: 0.4,
          browOuterUpRight: 0.4,
        },
      }),
      state,
    );
    expect(r.pose.expressionWeights.happy).toBeGreaterThan(0);
    expect(r.pose.expressionWeights.surprised).toBeGreaterThan(0);
    expect(r.pose.expressionWeights.happy).toBeLessThanOrEqual(1);
    expect(r.pose.expressionWeights.surprised).toBeLessThanOrEqual(1);
  });
});

describe("mapFaceToPose - jaw open drives aa", () => {
  it("opens the aa expression when jawOpen is high", () => {
    const state = createMappingState();
    const r = mapFaceToPose(
      face({ blendshapes: { jawOpen: 1 } }),
      state,
    );
    expect(r.pose.expressionWeights.aa).toBeGreaterThan(0);
  });
});

describe("mapFaceToPose - smoothing converges over frames", () => {
  it("eases an expression toward its target across repeated frames", () => {
    let state = createMappingState();
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const r = mapFaceToPose(face({ blendshapes: { jawOpen: 1 } }), state);
      state = r.state;
      last = r.pose.expressionWeights.aa;
    }
    expect(last).toBeGreaterThan(0.9);
  });
});

describe("mapFaceToPose - low confidence eases to neutral", () => {
  it("drives all weights and rotations toward zero when faceConfidence is below the floor", () => {
    let state = createMappingState();
    // build up a smile first
    for (let i = 0; i < 10; i++) {
      state = mapFaceToPose(
        face({ blendshapes: { mouthSmileLeft: 1, mouthSmileRight: 1 } }),
        state,
      ).state;
    }
    expect(state.smoothed.happy).toBeGreaterThan(0.5);
    // now lose the face
    let happy = 1;
    for (let i = 0; i < 20; i++) {
      const r = mapFaceToPose(
        face({ blendshapes: {}, headMatrix: null, faceConfidence: 0 }),
        state,
      );
      state = r.state;
      happy = r.pose.expressionWeights.happy;
    }
    expect(happy).toBeLessThan(0.05);
  });
});

describe("mapFaceToPose - head rotation split and clamp", () => {
  it("splits rotation between neck and head per neckShare and clamps to config ranges", () => {
    const cfg = DEFAULT_MAPPING_CONFIG;
    // a large yaw well beyond the clamp
    const big = Math.PI / 2;
    const c = Math.cos(big);
    const s = Math.sin(big);
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    let state = createMappingState();
    let neckY = 0;
    let headY = 0;
    for (let i = 0; i < 60; i++) {
      const r = mapFaceToPose(face({ headMatrix: m }), state);
      state = r.state;
      neckY = r.pose.neckEuler.y;
      headY = r.pose.headEuler.y;
    }
    const totalClamped = cfg.headClampRad.yaw;
    // neck gets ~neckShare of the clamped total, head gets the rest (signs depend on mirror; compare magnitudes)
    expect(Math.abs(neckY) + Math.abs(headY)).toBeCloseTo(totalClamped, 1);
    expect(Math.abs(neckY)).toBeLessThan(Math.abs(headY));
  });
});
