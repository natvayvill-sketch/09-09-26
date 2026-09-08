# Face Tracker ("Living Portrait") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single page to the existing Astro portfolio site where a visitor's webcam drives a 3D VRM avatar in real time, entirely client-side.

**Architecture:** One Astro page (`/living-portrait`) with a tiny inline bootstrap. All tracking/3D code lives in `src/tracker/` as plain TypeScript modules and is loaded lazily — `trackerApp` on the visitor's first "Start" click, and the heavy libraries (`three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`) only after camera permission is granted. Pure logic (mapping raw face data → avatar pose, device-tier selection, the UI state machine) is isolated into unit-tested modules; the browser/library adapters (camera, MediaPipe, three.js) are thin and verified manually.

**Tech Stack:** Astro (existing), TypeScript, `@mediapipe/tasks-vision` (FaceLandmarker), `three` + `@pixiv/three-vrm`, Vitest (existing).

**Spec:** [docs/superpowers/specs/2026-09-08-face-tracker-design.md](../specs/2026-09-08-face-tracker-design.md)

## Global Constraints

- Plain TypeScript only — no React or other UI framework — spec "Tech stack".
- Nothing derived from the camera (frames, landmarks, blendshapes, anything) is ever sent over the network. The only network requests the page makes are the one-time GETs of the model files from the site's own origin — spec "Privacy".
- No third-party scripts on the page. MediaPipe's WASM runtime and model file, and the avatar VRM, are all self-hosted under `public/tracker/` — spec "Tech stack" / "Assets".
- The heavy libraries (`three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`) must NOT appear in any non-tracker page's JS bundle, and must not appear in the `trackerApp` entry chunk either — they load only in their own lazy chunks fetched during the `loading` state — spec "Goals", "Code structure".
- The shipped avatar is a single file (`public/tracker/avatar.vrm`); swapping it for another valid VRM must require zero code changes — spec "Assets", "v1 done criteria".
- The shipped sample avatar must be verified **CC0** (public domain, no attribution required), with its provenance and license committed alongside it — spec "Assets".
- Camera `MediaStream` tracks must be `.stop()`-ed on Stop, on navigation away, and on `document.visibilitychange` to hidden — spec "Privacy", "Performance & degradation".
- Tests: Vitest unit tests for `mapping.ts`, `degradation.ts`, and the `stateMachine.ts` reducer only. The adapters (`camera.ts`, `faceTracker.ts`, `vrmScene.ts`, `ui.ts`, `trackerApp.ts`) are not unit-tested. No browser/E2E test framework is added — spec "Testing".
- `npm run build` must pass after every task — matches the existing site's testing approach.
- Default route is `/living-portrait`. Eye-gaze and body-lean are explicitly out of scope for v1; `mapping.ts` carries marked extension points for them — spec "Goals / non-goals", "Mapping".

## Deviations from the spec (deliberate, made while planning)

- The spec says `trackerApp.ts` "owns the state machine". This plan
  extracts the pure state-transition logic into its own module
  `stateMachine.ts` (a `reduce(state, event)` reducer) so it can be
  unit-tested directly, which is exactly what the spec's Testing section
  asks for ("the state machine ... given events ... lands in the expected
  state"). `trackerApp.ts` still owns *driving* the machine and running
  its effects.
- The spec's state table lists 8 states. This plan adds two the spec's
  own prose requires but the table omitted: `paused` (the spec says the
  loop pauses and camera releases on tab-hidden, and "resumes on return")
  and `error` (the spec requires "never a blank or broken screen", and
  model loading can fail).
- `ui.ts` is a new small module (state → DOM) that the spec's code
  structure didn't name; it keeps `trackerApp.ts` focused on wiring
  rather than markup.
- The spec says the tracker module loads "on the visitor's first Start
  click". This plan loads `trackerApp` (which is small — no heavy libs)
  as soon as the page renders, so the capability check can show
  `unsupported` without a wasted click. The **heavy** libraries (`three`,
  `@pixiv/three-vrm`, `@mediapipe/tasks-vision`) still load only after
  Start **and** camera permission — that's the constraint that matters
  and it is preserved. Task 12 Step 4 verifies it.

## Notes for all implementers

- Work from the repo root. All commands run there. Commit messages end with the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.
- The existing site is at: `src/pages/`, `src/components/`, `src/layouts/PageLayout.astro`, `src/styles/tokens.css` (CSS custom properties: `--color-paper`, `--color-paper-dark`, `--color-ink`, `--color-ink-soft`, `--color-stain`, `--color-accent-red`, `--color-accent-teal`, `--font-heading`, `--font-body`, `--space-1..6`, `--tilt-a..d`), `src/styles/global.css`, `src/lib/*.js` + `*.test.js`. Vitest runs via `npm run test` (which is `vitest run`).
- Library API surfaces below target `@mediapipe/tasks-vision` `^1.0`, `@pixiv/three-vrm` `^3.5`, `three` `^0.186`. If an installed version's surface differs, **keep the exported interface identical** (later tasks depend on it) and adjust only the internal library calls — the package's TypeScript types in `node_modules/` are the source of truth.

---

### Task 1: TypeScript config, tracker types, directory

**Files:**
- Create: `tsconfig.json`
- Create: `src/tracker/types.ts`

**Interfaces:**
- Produces: every shared type the rest of the plan uses — `RawFaceInput`, `Euler3`, `PoseUpdate`, `MappingState`, `QualityTier`, `DeviceSignals`, `TrackerStateName`, `TrackerState`, `TrackerEvent`, `TrackerEffect`.

- [ ] **Step 1: Add `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

(`astro/tsconfigs/strict` already turns on `strict`/`strictNullChecks`. Deliberately NOT adding `noUnusedParameters` / `noUncheckedIndexedAccess` — this code is dictionary-heavy and the existing site had no tsconfig at all, so keep the ratchet gentle.)

- [ ] **Step 2: Write `src/tracker/types.ts`**

```ts
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
```

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: exit 0. (Nothing imports these yet.)

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json src/tracker/types.ts
git commit -m "Add tsconfig and shared tracker types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `mapping.ts` — raw face data → avatar pose (pure, TDD)

**Files:**
- Create: `src/tracker/mapping.ts`
- Test: `src/tracker/mapping.test.ts`

**Interfaces:**
- Consumes: `RawFaceInput`, `PoseUpdate`, `MappingState`, `Euler3` from `./types`.
- Produces:
  - `interface MappingConfig` and `const DEFAULT_MAPPING_CONFIG: MappingConfig`
  - `createMappingState(): MappingState`
  - `mapFaceToPose(raw: RawFaceInput, prev: MappingState, config?: MappingConfig): { pose: PoseUpdate; state: MappingState }`
  - `matrixToEuler(m16: number[]): Euler3` (exported for its own tests)

- [ ] **Step 1: Write the failing tests**

`src/tracker/mapping.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run src/tracker/mapping.test.ts`
Expected: FAIL — `./mapping` does not exist.

- [ ] **Step 3: Write `src/tracker/mapping.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run src/tracker/mapping.test.ts`
Expected: PASS. If the yaw-decode sign test fails, adjust `matrixToEuler`'s `m13` handling — do not change the tests; the identity + 90° cases must hold.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/tracker/mapping.ts src/tracker/mapping.test.ts
git commit -m "Add pure face-to-pose mapping module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `degradation.ts` — device tier + frame-rate watchdog (pure, TDD)

**Files:**
- Create: `src/tracker/degradation.ts`
- Test: `src/tracker/degradation.test.ts`

**Interfaces:**
- Consumes: `DeviceSignals`, `QualityTier` from `./types`.
- Produces:
  - `pickTier(signals: DeviceSignals): QualityTier`
  - `interface WatchdogOptions { fpsFloor: number; sustainedMs: number }`
  - `class FrameRateWatchdog` with `constructor(opts: WatchdogOptions, onStruggling: () => void)`, `sample(fps: number, nowMs: number): void`, `reset(): void`
  - `readDeviceSignals(): DeviceSignals` (browser-reading; not unit-tested)
  - `hasWebGL2(): boolean` (browser-reading; not unit-tested)

- [ ] **Step 1: Write the failing tests**

`src/tracker/degradation.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { pickTier, FrameRateWatchdog } from "./degradation";
import type { DeviceSignals } from "./types";

function signals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    hardwareConcurrency: 12,
    deviceMemoryGb: 16,
    maxViewportPx: 1920,
    coarsePointer: false,
    ...overrides,
  };
}

describe("pickTier", () => {
  it("returns strong for a capable desktop", () => {
    expect(pickTier(signals())).toBe("strong");
  });
  it("returns weak when the pointer is coarse (touch device)", () => {
    expect(pickTier(signals({ coarsePointer: true }))).toBe("weak");
  });
  it("returns weak for low core counts", () => {
    expect(pickTier(signals({ hardwareConcurrency: 4 }))).toBe("weak");
  });
  it("returns weak for a small viewport", () => {
    expect(pickTier(signals({ maxViewportPx: 800 }))).toBe("weak");
  });
  it("returns weak for low device memory", () => {
    expect(pickTier(signals({ deviceMemoryGb: 4 }))).toBe("weak");
  });
  it("ignores null device memory", () => {
    expect(pickTier(signals({ deviceMemoryGb: null }))).toBe("strong");
  });
});

describe("FrameRateWatchdog", () => {
  it("fires once after fps stays below the floor for the sustained window", () => {
    const cb = vi.fn();
    const wd = new FrameRateWatchdog({ fpsFloor: 12, sustainedMs: 5000 }, cb);
    wd.sample(8, 0);
    wd.sample(8, 3000);
    expect(cb).not.toHaveBeenCalled();
    wd.sample(8, 5001);
    expect(cb).toHaveBeenCalledTimes(1);
    wd.sample(8, 8000);
    expect(cb).toHaveBeenCalledTimes(1); // does not fire again
  });

  it("resets the timer when fps recovers above the floor", () => {
    const cb = vi.fn();
    const wd = new FrameRateWatchdog({ fpsFloor: 12, sustainedMs: 5000 }, cb);
    wd.sample(8, 0);
    wd.sample(30, 3000); // recovered
    wd.sample(8, 6000); // window restarts here
    wd.sample(8, 9000);
    expect(cb).not.toHaveBeenCalled();
    wd.sample(8, 11001);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("stays quiet after reset() until the window elapses again", () => {
    const cb = vi.fn();
    const wd = new FrameRateWatchdog({ fpsFloor: 12, sustainedMs: 5000 }, cb);
    wd.sample(8, 0);
    wd.sample(8, 6000);
    expect(cb).toHaveBeenCalledTimes(1);
    wd.reset();
    wd.sample(8, 7000);
    wd.sample(8, 11000);
    expect(cb).toHaveBeenCalledTimes(1);
    wd.sample(8, 12001);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run src/tracker/degradation.test.ts`
Expected: FAIL — `./degradation` does not exist.

- [ ] **Step 3: Write `src/tracker/degradation.ts`**

```ts
import type { DeviceSignals, QualityTier } from "./types";

export function pickTier(signals: DeviceSignals): QualityTier {
  if (signals.coarsePointer) return "weak";
  if (signals.hardwareConcurrency <= 4) return "weak";
  if (signals.maxViewportPx < 900) return "weak";
  if (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4) {
    return "weak";
  }
  return "strong";
}

export interface WatchdogOptions {
  fpsFloor: number;
  sustainedMs: number;
}

export class FrameRateWatchdog {
  private belowSince: number | null = null;
  private fired = false;

  constructor(
    private readonly opts: WatchdogOptions,
    private readonly onStruggling: () => void,
  ) {}

  sample(fps: number, nowMs: number): void {
    if (this.fired) return;
    if (fps < this.opts.fpsFloor) {
      if (this.belowSince === null) {
        this.belowSince = nowMs;
      } else if (nowMs - this.belowSince >= this.opts.sustainedMs) {
        this.fired = true;
        this.onStruggling();
      }
    } else {
      this.belowSince = null;
    }
  }

  reset(): void {
    this.belowSince = null;
    this.fired = false;
  }
}

/** Browser-reading. Not unit-tested. */
export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    hardwareConcurrency: nav.hardwareConcurrency ?? 2,
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    maxViewportPx: Math.max(window.innerWidth, window.innerHeight),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

/** Browser-reading. Not unit-tested. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run src/tracker/degradation.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/tracker/degradation.ts src/tracker/degradation.test.ts
git commit -m "Add device-tier selection and frame-rate watchdog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `stateMachine.ts` — the tracker UI state reducer (pure, TDD)

**Files:**
- Create: `src/tracker/stateMachine.ts`
- Test: `src/tracker/stateMachine.test.ts`

**Interfaces:**
- Consumes: `TrackerState`, `TrackerEvent`, `TrackerEffect`, `TrackerStateName` from `./types`.
- Produces:
  - `const INITIAL_STATE: TrackerState` (`{ name: "intro", suppressStruggling: false }`)
  - `reduce(state: TrackerState, event: TrackerEvent): { state: TrackerState; effects: TrackerEffect[] }`

- [ ] **Step 1: Write the failing tests**

`src/tracker/stateMachine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { INITIAL_STATE, reduce } from "./stateMachine";
import type { TrackerState } from "./types";

const at = (name: TrackerState["name"], extra: Partial<TrackerState> = {}): TrackerState => ({
  name,
  suppressStruggling: false,
  ...extra,
});

describe("stateMachine.reduce", () => {
  it("intro + START -> requesting, requests the camera", () => {
    const r = reduce(INITIAL_STATE, { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("requesting + PERMISSION_GRANTED -> loading, loads models", () => {
    const r = reduce(at("requesting"), { type: "PERMISSION_GRANTED" });
    expect(r.state.name).toBe("loading");
    expect(r.effects).toContain("load-models");
  });

  it("requesting + PERMISSION_DENIED -> denied, no effects", () => {
    const r = reduce(at("requesting"), { type: "PERMISSION_DENIED" });
    expect(r.state.name).toBe("denied");
    expect(r.effects).toEqual([]);
  });

  it("denied + START -> requesting again", () => {
    const r = reduce(at("denied"), { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("loading + LOAD_OK -> running, starts the loop", () => {
    const r = reduce(at("loading"), { type: "LOAD_OK" });
    expect(r.state.name).toBe("running");
    expect(r.effects).toContain("start-loop");
  });

  it("loading + LOAD_FAILED -> error", () => {
    const r = reduce(at("loading"), { type: "LOAD_FAILED" });
    expect(r.state.name).toBe("error");
  });

  it("error + START -> requesting", () => {
    const r = reduce(at("error"), { type: "START" });
    expect(r.state.name).toBe("requesting");
  });

  it("running + FPS_LOW -> struggling (first time)", () => {
    const r = reduce(at("running"), { type: "FPS_LOW" });
    expect(r.state.name).toBe("struggling");
  });

  it("running + FPS_LOW stays running when struggling is suppressed", () => {
    const r = reduce(at("running", { suppressStruggling: true }), { type: "FPS_LOW" });
    expect(r.state.name).toBe("running");
  });

  it("struggling + KEEP_GOING -> running with suppressStruggling set", () => {
    const r = reduce(at("struggling"), { type: "KEEP_GOING" });
    expect(r.state.name).toBe("running");
    expect(r.state.suppressStruggling).toBe(true);
    expect(r.effects).toEqual([]);
  });

  it("running + STOP -> stopped, stops loop and releases camera", () => {
    const r = reduce(at("running"), { type: "STOP" });
    expect(r.state.name).toBe("stopped");
    expect(r.effects).toEqual(expect.arrayContaining(["stop-loop", "release-camera"]));
  });

  it("running + HIDDEN -> paused, stops loop and releases camera", () => {
    const r = reduce(at("running"), { type: "HIDDEN" });
    expect(r.state.name).toBe("paused");
    expect(r.effects).toEqual(expect.arrayContaining(["stop-loop", "release-camera"]));
  });

  it("paused + START -> requesting", () => {
    const r = reduce(at("paused"), { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("stopped resets suppressStruggling to false", () => {
    const r = reduce(at("struggling", { suppressStruggling: true }), { type: "STOP" });
    expect(r.state.suppressStruggling).toBe(false);
  });

  it("intro + UNSUPPORTED -> unsupported with the reason", () => {
    const r = reduce(INITIAL_STATE, { type: "UNSUPPORTED", reason: "no-webgl2" });
    expect(r.state.name).toBe("unsupported");
    expect(r.state.unsupportedReason).toBe("no-webgl2");
  });

  it("ignores events with no transition (no-op, same state, no effects)", () => {
    const r = reduce(at("intro"), { type: "LOAD_OK" });
    expect(r.state.name).toBe("intro");
    expect(r.effects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run src/tracker/stateMachine.test.ts`
Expected: FAIL — `./stateMachine` does not exist.

- [ ] **Step 3: Write `src/tracker/stateMachine.ts`**

```ts
import type { TrackerState, TrackerEvent, TrackerEffect } from "./types";

export const INITIAL_STATE: TrackerState = {
  name: "intro",
  suppressStruggling: false,
};

type Result = { state: TrackerState; effects: TrackerEffect[] };

const stop = (): Result => ({
  state: { name: "stopped", suppressStruggling: false },
  effects: ["stop-loop", "release-camera"],
});

const pause = (): Result => ({
  state: { name: "paused", suppressStruggling: false },
  effects: ["stop-loop", "release-camera"],
});

const request = (s: TrackerState): Result => ({
  state: { ...s, name: "requesting" },
  effects: ["request-camera"],
});

export function reduce(state: TrackerState, event: TrackerEvent): Result {
  const noop: Result = { state, effects: [] };

  switch (event.type) {
    case "UNSUPPORTED":
      return {
        state: { ...state, name: "unsupported", unsupportedReason: event.reason },
        effects: [],
      };

    case "START":
      if (["intro", "denied", "error", "paused", "stopped"].includes(state.name)) {
        return request(state);
      }
      return noop;

    case "PERMISSION_GRANTED":
      if (state.name === "requesting") {
        return { state: { ...state, name: "loading" }, effects: ["load-models"] };
      }
      return noop;

    case "PERMISSION_DENIED":
      if (state.name === "requesting") {
        return { state: { ...state, name: "denied" }, effects: [] };
      }
      return noop;

    case "LOAD_OK":
      if (state.name === "loading") {
        return { state: { ...state, name: "running" }, effects: ["start-loop"] };
      }
      return noop;

    case "LOAD_FAILED":
      if (state.name === "loading") {
        return { state: { ...state, name: "error" }, effects: [] };
      }
      return noop;

    case "FPS_LOW":
      if (state.name === "running" && !state.suppressStruggling) {
        return { state: { ...state, name: "struggling" }, effects: [] };
      }
      return noop;

    case "KEEP_GOING":
      if (state.name === "struggling") {
        return {
          state: { ...state, name: "running", suppressStruggling: true },
          effects: [],
        };
      }
      return noop;

    case "STOP":
      if (["running", "struggling", "paused"].includes(state.name)) {
        return stop();
      }
      return noop;

    case "HIDDEN":
      if (state.name === "running" || state.name === "struggling") {
        return pause();
      }
      return noop;

    default:
      return noop;
  }
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run src/tracker/stateMachine.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/tracker/stateMachine.ts src/tracker/stateMachine.test.ts
git commit -m "Add tracker UI state machine

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `camera.ts` — webcam adapter

**Files:**
- Create: `src/tracker/camera.ts`

**Interfaces:**
- Produces:
  - `type CameraResult = { ok: true; stream: MediaStream } | { ok: false; reason: "denied" | "no-device" | "error"; error: unknown }`
  - `requestCamera(): Promise<CameraResult>`
  - `stopCamera(stream: MediaStream): void`

- [ ] **Step 1: Write `src/tracker/camera.ts`**

```ts
export type CameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "denied" | "no-device" | "error"; error: unknown };

export async function requestCamera(): Promise<CameraResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "no-device", error: new Error("getUserMedia unavailable") };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    return { ok: true, stream };
  } catch (error) {
    const name = (error as DOMException | undefined)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, reason: "denied", error };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return { ok: false, reason: "no-device", error };
    }
    return { ok: false, reason: "error", error };
  }
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
```

- [ ] **Step 2: Verify types and build**

Run: `npm run build`
Expected: exit 0. (Astro type-checks `.ts` files it can reach; if `camera.ts` isn't imported yet it still must be valid TypeScript — run `npx tsc --noEmit -p tsconfig.json` and expect no errors in `src/tracker/camera.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/tracker/camera.ts
git commit -m "Add webcam adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: MediaPipe assets + `faceTracker.ts` adapter

**Files:**
- Create: `src/tracker/faceTracker.ts`
- Create: `public/tracker/face_landmarker.task` (downloaded)
- Create: `public/tracker/wasm/` (copied from the npm package)
- Modify: `package.json` (adds `@mediapipe/tasks-vision`)
- Modify: `.gitignore` (ensure `public/tracker/` is NOT ignored — it must be committed)

**Interfaces:**
- Consumes: `RawFaceInput` from `./types`.
- Produces:
  - `interface FaceTracker { detect(video: HTMLVideoElement, timestampMs: number): RawFaceInput; close(): void }`
  - `createFaceTracker(opts: { wasmBase: string; modelUrl: string; delegate: "GPU" | "CPU" }): Promise<FaceTracker>`

- [ ] **Step 1: Install the package**

Run: `npm install @mediapipe/tasks-vision@latest`
Expected: exit 0; it appears under `dependencies`.

- [ ] **Step 2: Self-host the WASM runtime**

The runtime ships inside the package. Copy it into `public/`:

```bash
mkdir -p public/tracker/wasm
cp node_modules/@mediapipe/tasks-vision/wasm/* public/tracker/wasm/
ls public/tracker/wasm/
```
Expected: several files including `vision_wasm_internal.js`, `vision_wasm_internal.wasm` (names may vary by version — copy the whole directory).

- [ ] **Step 3: Download the face landmarker model**

```bash
curl -L -o public/tracker/face_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
ls -la public/tracker/face_landmarker.task
```
Expected: a file roughly 3–4 MB. If the URL 404s, get the current URL from the MediaPipe FaceLandmarker docs ("Models" section) — it must be the `.task` bundle for `face_landmarker`.

- [ ] **Step 4: Confirm `public/tracker/` will be committed**

Run: `git check-ignore public/tracker/face_landmarker.task; echo "ignored? exit $?"`
Expected: `exit 1` (NOT ignored). If it prints a match, remove that rule from `.gitignore` — these assets must be in the repo so Netlify serves them from our origin.

- [ ] **Step 5: Write `src/tracker/faceTracker.ts`**

```ts
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import type { RawFaceInput } from "./types";

export interface FaceTracker {
  detect(video: HTMLVideoElement, timestampMs: number): RawFaceInput;
  close(): void;
}

export async function createFaceTracker(opts: {
  wasmBase: string;
  modelUrl: string;
  delegate: "GPU" | "CPU";
}): Promise<FaceTracker> {
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmBase);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: opts.modelUrl, delegate: opts.delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  return {
    detect(video, timestampMs): RawFaceInput {
      const res = landmarker.detectForVideo(video, timestampMs);
      const categories = res.faceBlendshapes?.[0]?.categories ?? [];
      const blendshapes: Record<string, number> = {};
      for (const c of categories) {
        if (c.categoryName) blendshapes[c.categoryName] = c.score;
      }
      const matrix = res.facialTransformationMatrixes?.[0]?.data ?? null;
      return {
        blendshapes,
        headMatrix: matrix ? Array.from(matrix) : null,
        faceConfidence: categories.length > 0 ? 1 : 0,
      };
    },
    close() {
      landmarker.close();
    },
  };
}
```

- [ ] **Step 6: Verify types and build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/tracker/faceTracker.ts`. If the installed version's option or result field names differ, adjust the internal calls but keep `FaceTracker` and `createFaceTracker`'s signatures exactly as specified.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/tracker/faceTracker.ts public/tracker/ package.json package-lock.json .gitignore
git commit -m "Add self-hosted MediaPipe assets and FaceLandmarker adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: CC0 avatar asset

**Files:**
- Create: `public/tracker/avatar.vrm`
- Create: `public/tracker/avatar.LICENSE.txt`

**Interfaces:** none (asset only).

- [ ] **Step 1: Obtain a CC0 VRM**

Get one humanoid VRM avatar, ≤ 8 MB, from a source that is unambiguously **CC0** (public domain, no attribution required):
- Primary: <https://www.opensourceavatars.com/en/gallery> — the whole collection is CC0 ("© 2026 ToxSam. All avatars CC0."). Pick a full-body humanoid model, download its `.vrm`.
- The backing registry is <https://github.com/ToxSam/open-source-avatars> whose README states CC0.

Save it as `public/tracker/avatar.vrm`.

- [ ] **Step 2: Record provenance and license**

Create `public/tracker/avatar.LICENSE.txt` with: the model's name, the exact source URL it was downloaded from, the date, and a verbatim quote of the CC0/public-domain statement from that source. Example structure:

```
Avatar: <model name>
Source: <exact URL>
Downloaded: 2026-09-08
License: CC0 1.0 (public domain, no attribution required)
Verbatim license statement from source:
"<quote>"
```

- [ ] **Step 3: Sanity-check the file**

```bash
ls -la public/tracker/avatar.vrm
file public/tracker/avatar.vrm
```
Expected: a binary file (glTF/GLB container), well under 8 MB. If it is larger than 8 MB, pick a lighter model.

- [ ] **Step 4: Commit**

```bash
git add public/tracker/avatar.vrm public/tracker/avatar.LICENSE.txt
git commit -m "Add CC0 sample avatar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `vrmScene.ts` — three.js + three-vrm adapter

**Files:**
- Create: `src/tracker/vrmScene.ts`
- Modify: `package.json` (adds `three`, `@pixiv/three-vrm`)

**Interfaces:**
- Consumes: `PoseUpdate`, `QualityTier` from `./types`.
- Produces:
  - `interface VrmScene { mount(canvas: HTMLCanvasElement, width: number, height: number): void; loadAvatar(url: string): Promise<void>; applyPose(pose: PoseUpdate): void; render(deltaSeconds: number): void; setQuality(tier: QualityTier): void; resize(width: number, height: number): void; dispose(): void }`
  - `createVrmScene(): VrmScene`

- [ ] **Step 1: Install packages**

Run: `npm install three@latest @pixiv/three-vrm@latest`
Also install three's types: `npm install -D @types/three@latest`
Expected: exit 0; `three` and `@pixiv/three-vrm` under `dependencies`, `@types/three` under `devDependencies`.

- [ ] **Step 2: Write `src/tracker/vrmScene.ts`**

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { PoseUpdate, QualityTier } from "./types";

export interface VrmScene {
  mount(canvas: HTMLCanvasElement, width: number, height: number): void;
  loadAvatar(url: string): Promise<void>;
  applyPose(pose: PoseUpdate): void;
  render(deltaSeconds: number): void;
  setQuality(tier: QualityTier): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createVrmScene(): VrmScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9dcc2"); // soft paper-adjacent tint

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 1.35, 1.1);
  camera.lookAt(0, 1.35, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5c, 1.4);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(1, 2, 1.5);
  scene.add(dir);

  let renderer: THREE.WebGLRenderer | null = null;
  let vrm: VRM | null = null;
  let currentTier: QualityTier = "strong";

  function applyTier(): void {
    if (!renderer) return;
    const ratio = currentTier === "strong" ? Math.min(window.devicePixelRatio, 2) : 1;
    renderer.setPixelRatio(ratio);
    renderer.shadowMap.enabled = currentTier === "strong";
    dir.castShadow = currentTier === "strong";
    dir.intensity = currentTier === "strong" ? 1.1 : 0.9;
  }

  function setBone(name: "neck" | "head", e: { x: number; y: number; z: number }): void {
    const node = vrm?.humanoid?.getNormalizedBoneNode(name);
    if (node) node.rotation.set(e.x, e.y, e.z);
  }

  return {
    mount(canvas, width, height) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyTier();
    },

    async loadAvatar(url) {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const loaded = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(loaded); // no-op for VRM 1.0; faces the camera for VRM 0.x
      if (vrm) scene.remove(vrm.scene);
      vrm = loaded;
      scene.add(vrm.scene);
    },

    applyPose(pose) {
      const em = vrm?.expressionManager;
      if (em) {
        for (const [name, weight] of Object.entries(pose.expressionWeights)) {
          try {
            em.setValue(name, weight);
          } catch {
            /* model lacks this expression preset; skip */
          }
        }
      }
      setBone("neck", pose.neckEuler);
      setBone("head", pose.headEuler);
    },

    render(deltaSeconds) {
      vrm?.update(deltaSeconds);
      renderer?.render(scene, camera);
    },

    setQuality(tier) {
      currentTier = tier;
      applyTier();
    },

    resize(width, height) {
      renderer?.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    dispose() {
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrm = null;
      }
      renderer?.dispose();
      renderer = null;
    },
  };
}
```

- [ ] **Step 3: Verify types and build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/tracker/vrmScene.ts`. If a `VRMUtils` helper name or `getNormalizedBoneNode` differs in the installed `@pixiv/three-vrm` version, consult its types in `node_modules/@pixiv/three-vrm/` and adjust — keep the `VrmScene` interface and `createVrmScene` signature exactly as specified. `three/addons/*` is the modern import alias; if unresolved, use `three/examples/jsm/*` instead.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/tracker/vrmScene.ts package.json package-lock.json
git commit -m "Add three.js + three-vrm scene adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `ui.ts` + `trackerApp.ts` — the conductor

**Files:**
- Create: `src/tracker/ui.ts`
- Create: `src/tracker/trackerApp.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8 —
  - `./types` (all)
  - `./stateMachine` — `INITIAL_STATE`, `reduce`
  - `./mapping` — `createMappingState`, `mapFaceToPose`, `DEFAULT_MAPPING_CONFIG`
  - `./degradation` — `readDeviceSignals`, `hasWebGL2`, `pickTier`, `FrameRateWatchdog`
  - `./camera` — `requestCamera`, `stopCamera`, `CameraResult`
  - `./faceTracker` — `createFaceTracker`, `FaceTracker` (dynamically imported)
  - `./vrmScene` — `createVrmScene`, `VrmScene` (dynamically imported)
- Produces:
  - `ui.ts`: `renderState(root: HTMLElement, state: TrackerState, handlers: { onStart: () => void; onStop: () => void; onKeepGoing: () => void }): void`
  - `trackerApp.ts`: `start(opts: { root: HTMLElement; canvas: HTMLCanvasElement; video: HTMLVideoElement; modelUrl: string; wasmBase: string; avatarUrl: string }): void`

- [ ] **Step 1: Write `src/tracker/ui.ts`**

```ts
import type { TrackerState } from "./types";

interface Handlers {
  onStart: () => void;
  onStop: () => void;
  onKeepGoing: () => void;
}

const COPY: Record<TrackerState["name"], { title: string; body: string; button?: string }> = {
  intro: {
    title: "The Living Portrait",
    body:
      "This turns your webcam into a puppet. Everything runs on your device — no video is sent anywhere, and nothing is recorded.",
    button: "Start camera",
  },
  requesting: { title: "One moment", body: "Waiting for camera permission…" },
  denied: {
    title: "No camera access",
    body:
      "On a computer, click the camera icon in your browser's address bar to allow access, then try again.",
    button: "Try again",
  },
  loading: { title: "Waking up the puppet", body: "Loading the model — this happens once." },
  running: { title: "", body: "", button: "Stop" },
  struggling: {
    title: "Running slowly",
    body: "This works best on a computer.",
    button: "Keep going anyway",
  },
  paused: {
    title: "Paused",
    body: "You switched away, so the camera was released.",
    button: "Start again",
  },
  stopped: { title: "Camera off", body: "Thanks for trying it.", button: "Start again" },
  error: {
    title: "Something went wrong",
    body: "The model failed to load. Check your connection and try again.",
    button: "Try again",
  },
  unsupported: { title: "Not supported here", body: "" },
};

export function renderState(root: HTMLElement, state: TrackerState, handlers: Handlers): void {
  const c = COPY[state.name]!;
  root.innerHTML = "";

  if (state.name === "running") {
    // minimal overlay: just a Stop button
    const stop = button("Stop", "lp-btn");
    stop.addEventListener("click", handlers.onStop);
    root.appendChild(stop);
    return;
  }

  const panel = document.createElement("div");
  panel.className = "lp-panel";

  if (c.title) {
    const h = document.createElement("p");
    h.className = "lp-panel-title";
    h.textContent = c.title;
    panel.appendChild(h);
  }

  let body = c.body;
  if (state.name === "unsupported") {
    body =
      state.unsupportedReason === "no-webgl2"
        ? "Your browser can't run the 3D view. Try a recent Chrome, Edge, Firefox, or Safari."
        : "This runs best on a computer. You can still try it below.";
  }
  if (body) {
    const p = document.createElement("p");
    p.textContent = body;
    panel.appendChild(p);
  }

  const btnLabel =
    state.name === "unsupported" && state.unsupportedReason === "weak-device"
      ? "Try anyway"
      : c.button;

  if (btnLabel && !(state.name === "unsupported" && state.unsupportedReason === "no-webgl2")) {
    const b = button(btnLabel, "lp-btn");
    b.addEventListener("click", () => {
      if (state.name === "struggling") handlers.onKeepGoing();
      else handlers.onStart();
    });
    panel.appendChild(b);
  }

  root.appendChild(panel);
}

function button(label: string, className: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  return b;
}
```

- [ ] **Step 2: Write `src/tracker/trackerApp.ts`**

```ts
import type {
  TrackerState,
  TrackerEvent,
  TrackerEffect,
  MappingState,
} from "./types";
import { INITIAL_STATE, reduce } from "./stateMachine";
import { createMappingState, mapFaceToPose, DEFAULT_MAPPING_CONFIG } from "./mapping";
import {
  readDeviceSignals,
  hasWebGL2,
  pickTier,
  FrameRateWatchdog,
} from "./degradation";
import { requestCamera, stopCamera } from "./camera";
import { renderState } from "./ui";
import type { FaceTracker } from "./faceTracker";
import type { VrmScene } from "./vrmScene";

interface StartOpts {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  modelUrl: string;
  wasmBase: string;
  avatarUrl: string;
}

export function start(opts: StartOpts): void {
  let state: TrackerState = INITIAL_STATE;
  let stream: MediaStream | null = null;
  let faceTracker: FaceTracker | null = null;
  let scene: VrmScene | null = null;
  let mapState: MappingState = createMappingState();
  let rafId = 0;
  let lastTs = 0;
  let fpsEma = 60;

  const tier = pickTier(readDeviceSignals());
  const watchdog = new FrameRateWatchdog(
    { fpsFloor: 12, sustainedMs: 5000 },
    () => dispatch({ type: "FPS_LOW" }),
  );

  function draw(): void {
    renderState(opts.root, state, {
      onStart: () => dispatch({ type: "START" }),
      onStop: () => dispatch({ type: "STOP" }),
      onKeepGoing: () => dispatch({ type: "KEEP_GOING" }),
    });
  }

  function dispatch(event: TrackerEvent): void {
    const { state: next, effects } = reduce(state, event);
    state = next;
    draw();
    for (const eff of effects) void runEffect(eff);
  }

  async function runEffect(effect: TrackerEffect): Promise<void> {
    switch (effect) {
      case "request-camera": {
        const result = await requestCamera();
        if (result.ok) {
          stream = result.stream;
          opts.video.srcObject = stream;
          await opts.video.play().catch(() => undefined);
          dispatch({ type: "PERMISSION_GRANTED" });
        } else {
          dispatch({ type: "PERMISSION_DENIED" });
        }
        return;
      }
      case "load-models": {
        try {
          if (!faceTracker) {
            const { createFaceTracker } = await import("./faceTracker");
            faceTracker = await createFaceTracker({
              wasmBase: opts.wasmBase,
              modelUrl: opts.modelUrl,
              delegate: "GPU",
            });
          }
          if (!scene) {
            const { createVrmScene } = await import("./vrmScene");
            scene = createVrmScene();
            const rect = opts.canvas.getBoundingClientRect();
            scene.mount(opts.canvas, rect.width || 480, rect.height || 480);
            scene.setQuality(tier);
            await scene.loadAvatar(opts.avatarUrl);
          }
          dispatch({ type: "LOAD_OK" });
        } catch (err) {
          console.error("[living-portrait] load failed", err);
          dispatch({ type: "LOAD_FAILED" });
        }
        return;
      }
      case "start-loop": {
        watchdog.reset();
        mapState = createMappingState();
        lastTs = performance.now();
        const loop = (now: number): void => {
          rafId = requestAnimationFrame(loop);
          const dt = Math.min((now - lastTs) / 1000, 0.1);
          lastTs = now;
          if (dt > 0) fpsEma = fpsEma * 0.9 + (1 / dt) * 0.1;
          watchdog.sample(fpsEma, now);

          if (faceTracker && scene && opts.video.readyState >= 2) {
            const raw = faceTracker.detect(opts.video, now);
            const mapped = mapFaceToPose(raw, mapState, DEFAULT_MAPPING_CONFIG);
            mapState = mapped.state;
            scene.applyPose(mapped.pose);
          }
          scene?.render(dt);
        };
        rafId = requestAnimationFrame(loop);
        return;
      }
      case "stop-loop": {
        cancelAnimationFrame(rafId);
        rafId = 0;
        return;
      }
      case "release-camera": {
        if (stream) {
          stopCamera(stream);
          stream = null;
        }
        opts.video.srcObject = null;
        return;
      }
    }
  }

  // capability gate
  if (!hasWebGL2()) {
    dispatch({ type: "UNSUPPORTED", reason: "no-webgl2" });
  } else if (tier === "weak" && readDeviceSignals().maxViewportPx < 700) {
    dispatch({ type: "UNSUPPORTED", reason: "weak-device" });
  } else {
    draw();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") dispatch({ type: "HIDDEN" });
  });

  const onResize = (): void => {
    if (!scene) return;
    const rect = opts.canvas.getBoundingClientRect();
    scene.resize(rect.width || 480, rect.height || 480);
  };
  window.addEventListener("resize", onResize);
}
```

- [ ] **Step 3: Verify types and build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. Note the dynamic `import("./faceTracker")` / `import("./vrmScene")` — this is what keeps `three` / `@pixiv/three-vrm` / `@mediapipe/tasks-vision` out of the `trackerApp` chunk. Do NOT convert them to static `import` statements.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/tracker/ui.ts src/tracker/trackerApp.ts
git commit -m "Add tracker conductor and state-driven UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: `living-portrait.astro` page

**Files:**
- Create: `src/pages/living-portrait.astro`
- Modify: `src/components/Nav.astro` (add the nav link)

**Interfaces:**
- Consumes: `src/tracker/trackerApp.ts`'s `start(opts)` (dynamically imported by the inline bootstrap).

- [ ] **Step 1: Add the nav link**

In `src/components/Nav.astro`, add one entry to the `links` array so it becomes:

```ts
const links = [
  { href: '/', label: 'Home' },
  { href: '/work/', label: 'Work' },
  { href: '/living-portrait/', label: 'Living Portrait' },
  { href: '/contact/', label: 'Contact' },
];
```

- [ ] **Step 2: Write `src/pages/living-portrait.astro`**

```astro
---
import PageLayout from "../layouts/PageLayout.astro";
import TapeStrip from "../components/TapeStrip.astro";
---

<PageLayout title="The Living Portrait">
  <section class="lp-intro">
    <h1>The Living Portrait</h1>
    <p>
      A photo in the scrapbook that happens to be alive. Give it your
      webcam and it will mimic your face — your head, your blinks, your
      smile. Everything runs on your device; nothing is sent anywhere or
      recorded.
    </p>
  </section>

  <div class="lp-frame">
    <TapeStrip rotate="var(--tilt-d)" />
    <div class="lp-stage">
      <canvas id="lp-canvas" width="480" height="480" aria-label="Avatar view"></canvas>
      <div id="lp-ui" class="lp-ui"></div>
    </div>
    <p class="lp-caption">say cheese</p>
  </div>

  <video id="lp-video" playsinline muted class="lp-video"></video>

  <details class="lp-privacy">
    <summary>How this works &amp; your privacy</summary>
    <p>
      Your webcam feed is analysed frame-by-frame in your browser to find
      52 tiny facial measurements (how open your mouth is, how raised a
      brow, and so on). Those numbers move the 3D puppet. The video is
      never shown on this page, never saved, and never leaves your
      device. The only things downloaded are the puppet and the
      face-reading model, once, from this site.
    </p>
  </details>
</PageLayout>

<script>
  const root = document.getElementById("lp-ui");
  const canvas = document.getElementById("lp-canvas");
  const video = document.getElementById("lp-video");
  if (root && canvas instanceof HTMLCanvasElement && video instanceof HTMLVideoElement) {
    import("../tracker/trackerApp").then(({ start }) => {
      start({
        root,
        canvas,
        video,
        modelUrl: "/tracker/face_landmarker.task",
        wasmBase: "/tracker/wasm",
        avatarUrl: "/tracker/avatar.vrm",
      });
    });
  }
</script>

<style>
  .lp-intro { max-width: 42rem; }
  /* the webcam feed is used as tracking input but never shown; kept rendered
     (not display:none) so browsers don't throttle its decode pipeline */
  .lp-video {
    position: fixed;
    left: -10px;
    top: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .lp-frame {
    background: #fff;
    padding: var(--space-3) var(--space-3) var(--space-5);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
    transform: rotate(var(--tilt-b));
    width: fit-content;
    max-width: 100%;
    margin: var(--space-5) auto;
  }
  .lp-stage {
    position: relative;
    width: min(60vw, 30rem);
    aspect-ratio: 1 / 1;
    background: #e9dcc2;
  }
  #lp-canvas { width: 100%; height: 100%; display: block; }
  .lp-ui {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    text-align: center;
  }
  .lp-panel {
    background: rgba(255, 253, 248, 0.94);
    border: 1px solid var(--color-ink-soft);
    padding: var(--space-3) var(--space-4);
    max-width: 22rem;
  }
  .lp-panel-title { font-family: var(--font-heading); font-size: 1.5rem; margin: 0 0 var(--space-2); }
  .lp-btn {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    background: var(--color-accent-red);
    color: #fff;
    border: none;
    padding: var(--space-2) var(--space-4);
    margin-top: var(--space-2);
    cursor: pointer;
  }
  .lp-ui:has(.lp-btn:only-child) { align-items: flex-end; justify-content: flex-end; padding: var(--space-2); }
  .lp-caption {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    text-align: center;
    margin: var(--space-2) 0 0;
    color: var(--color-ink);
  }
  .lp-privacy { max-width: 42rem; margin-top: var(--space-5); }
  .lp-privacy summary { font-family: var(--font-heading); font-size: 1.2rem; cursor: pointer; }
</style>
```

- [ ] **Step 3: Verify the build and the page renders**

Run: `npm run build`
Expected: exit 0; `dist/living-portrait/index.html` exists.

Run: `npm run dev`, open `http://localhost:4321/living-portrait/`. Expected: the scrapbook-framed page with the intro copy, the framed stage showing the "Start camera" panel, and the privacy `<details>`. Clicking "Start camera" triggers the browser's camera permission prompt. (Full tracking behavior is validated in Task 12's manual checklist.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/living-portrait.astro src/components/Nav.astro
git commit -m "Add the Living Portrait page and nav link

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Add two sections to `README.md`**

Add these after the existing "Known v1 limitations" section (adjust the anchor if the file's structure differs — the point is they land as new top-level `##` sections):

```markdown
## The Living Portrait page

`/living-portrait` is a webcam-driven 3D avatar demo. All of its code is
in `src/tracker/` (plain TypeScript) and loads lazily — nothing heavy is
downloaded until a visitor clicks "Start camera", and the 3D/tracking
libraries only load after they grant camera permission. Nothing derived
from the camera ever leaves the browser.

Self-hosted assets live in `public/tracker/`:
- `avatar.vrm` — the 3D model (see "Swapping the avatar" below)
- `face_landmarker.task` + `wasm/` — the MediaPipe face-reading model and runtime
- `avatar.LICENSE.txt` — provenance and license of the shipped model

## Swapping the avatar

1. Make or download a **VRM** model (VRoid Studio, free, exports VRM).
2. Keep the file under ~8 MB — in VRoid Studio's export dialog, reduce
   texture size (1024 or 2048) and enable polygon reduction if needed.
3. Replace `public/tracker/avatar.vrm` with your file (keep the name).
4. Update `public/tracker/avatar.LICENSE.txt` to describe your model.
5. `npm run build`, then open `/living-portrait/` and check it loads and
   tracks. No code changes are needed — the standard VRM expression
   presets (blink, happy, aa/ih/ou, surprised) are what the mapping
   drives.

If a specific expression looks off, the tuning knobs are all in
`DEFAULT_MAPPING_CONFIG` in `src/tracker/mapping.ts`.
```

- [ ] **Step 2: Add tracker items to the Manual QA checklist**

In `README.md`'s existing "Manual QA checklist" section, add these bullets:

```markdown
- [ ] `/living-portrait/`: on a desktop, click "Start camera", grant
      permission — within a few seconds the avatar mirrors your head,
      blinks, mouth, and smile, smoothly.
- [ ] `/living-portrait/`: deny camera permission — the recovery message
      appears with a "Try again" button that re-prompts.
- [ ] `/living-portrait/`: click "Stop", then check your browser's
      camera indicator has turned off (camera released).
- [ ] `/living-portrait/`: while tracking, switch to another tab and
      back — camera indicator turns off on leave; a "Start again" panel
      is shown on return.
- [ ] `/living-portrait/` on a phone — it either runs (reduced quality)
      or shows "runs best on a computer"; it is never blank or broken.
- [ ] Cover the camera / leave frame while running — the avatar eases to
      a neutral resting pose rather than freezing or glitching.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the Living Portrait page and avatar-swap workflow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Final integration — build, bundle isolation, full test run

**Files:** none (verification only). If a check fails, fix the offending earlier file and note it in the report.

**Interfaces:** none.

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all test files pass — the 3 existing site tests plus `mapping.test.ts`, `degradation.test.ts`, `stateMachine.test.ts`. Output pristine (no stray warnings).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors anywhere in `src/`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: exit 0. Pages built include `/living-portrait/`.

- [ ] **Step 4: Verify heavy libraries are isolated to lazy chunks**

```bash
# The heavy deps must NOT appear in the homepage / work / contact bundles,
# and must NOT appear in the trackerApp entry chunk.
grep -rl "three" dist/_astro/*.js | head
node -e "
const fs=require('fs'), path=require('path');
const dir='dist/_astro';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.js'));
const heavy=['@pixiv/three-vrm','MediaPipeTasksVision','FaceLandmarker','three.core','GLTFLoader'];
for (const f of files) {
  const src=fs.readFileSync(path.join(dir,f),'utf8');
  const hits=heavy.filter(h=>src.includes(h));
  if (hits.length) console.log(f, '=>', hits.join(', '), '(' + (src.length/1024|0) + 'kb)');
}
"
```
Expected: the heavy hits appear only in one or two large lazily-loaded chunks (the ones dynamically imported from `trackerApp.ts`), NOT in any chunk referenced by `dist/index.html`, `dist/work/index.html`, `dist/contact/index.html`, or the small chunk that `dist/living-portrait/index.html` loads eagerly.

Verify which chunks each page loads eagerly:
```bash
grep -o '_astro/[A-Za-z0-9_.-]*\.js' dist/index.html dist/work/index.html dist/contact/index.html dist/living-portrait/index.html | sort -u
```
Expected: none of the chunks listed for the non-tracker pages, and none listed as an eager `<script>` for `living-portrait`, are chunks that contained the heavy libraries above. If a heavy library leaked into an eagerly-loaded chunk, the cause is almost always a static `import` that should be `await import(...)` — check `trackerApp.ts` and the page's inline `<script>`.

- [ ] **Step 5: Manual smoke (documented in the report)**

Run `npm run dev` and, on a desktop browser, walk the Task 11 checklist items you can do locally (start/grant/track, deny path, stop releases camera, tab-switch). Record what you observed in the task report. Full cross-device testing is the site owner's pre-launch checklist, not this task.

- [ ] **Step 6: Commit (only if Step 4 required a fix)**

```bash
git add -A
git commit -m "Fix lazy-loading isolation for tracker bundles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

If no fix was needed, there is nothing to commit — the feature is complete.
