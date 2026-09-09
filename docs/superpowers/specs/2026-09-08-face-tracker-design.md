# Face Tracker ("Living Portrait") — Design Spec

Date: 2026-09-08
Status: Approved by user, ready for implementation planning

## Purpose

The second sub-project of the portfolio site: a browser-based, real-time
face tracker that turns a visitor's webcam into a 3D avatar puppet, in
the style of VTuber software. It lives on a single new page of the
existing Astro portfolio site.

Its purpose is a **portfolio showpiece** — an interactive demo visitors
(and the site owner) try for fun and see an avatar mimic their face. It
is explicitly NOT a production VTubing tool: no OBS/virtual-camera
output, no persisted user settings, no multi-hour reliability
requirement, no webcam preview for framing.

## Goals / non-goals

- Goal: a visitor clicks "Start", grants camera permission, and sees a
  3D avatar mirror their head movement, blinks, mouth, smile, and
  eyebrows in real time.
- Goal: everything runs client-side — no video frames, landmarks, or
  derived data ever leave the browser.
- Goal: works on desktop (Chrome, Edge, Firefox, Safari) and degrades
  gracefully on mobile.
- Goal: the heavy tracking/3D code loads only on this page, and only
  after the visitor clicks "Start" — zero impact on the rest of the
  site.
- Goal: the shipped sample avatar is a drop-in file the owner replaces
  with their own VRoid-made model later, with no code changes.
- Non-goal (v1): eye-gaze tracking and upper-body lean. The mapping
  layer is structured so these can be added later without a rewrite.
- Non-goal: true phoneme-accurate lip-sync (MediaPipe reads mouth
  shape, not sound — "clearly talking" is the bar, not broadcast
  quality).
- Non-goal: OBS output, virtual camera, settings persistence, avatar
  switcher, recording/export.
- Non-goal: automated end-to-end/browser tests (consistent with the
  site's existing testing approach).

## Tech stack

- **MediaPipe FaceLandmarker** (`@mediapipe/tasks-vision`, Google, free,
  runs in-browser on GPU via WebGL/WASM). Outputs per frame: 52
  ARKit-style blendshape coefficients (0–1), a 4x4 facial transformation
  matrix (head pose), and a face-detected confidence. Model file
  (`face_landmarker.task`, ~3–4 MB) and WASM runtime are **self-hosted**
  in `public/tracker/` (version-pinned, downloaded from Google's
  official distribution at setup time), not loaded from a CDN.
- **three.js + `@pixiv/three-vrm`** — renders the 3D VRM avatar.
  three-vrm is the standard, maintained library; handles VRM 0.x and
  1.0, exposes the humanoid bones and the expression manager.
- **Plain TypeScript** for all tracker code — no React or other
  framework (matches how the site is currently built).
- **Astro** page + lazy-loaded island (existing site framework).
- **Vitest** for unit tests (existing site test runner).
- Rejected: Kalidokit (unmaintained ~3 years, predates MediaPipe
  blendshape output, built for full-body rigging — a fragile dependency
  for something we can do cleanly against VRM's standardized
  expressions). Rejected: any commercial/hosted face-tracking SDK
  (cost/caps, sends camera data off-device, no ownership).

## Page & route

- New page: `src/pages/living-portrait.astro` → route `/living-portrait`
  (default, chosen to match the scrapbook framing). Changing the route
  is a one-file rename; the owner can pick a different name at planning
  time (`/tracker`, `/booth`, `/mirror`, …).
- Uses the existing `PageLayout` (paper background, nav, footer). Added
  to the site nav if the owner wants it there, or left as an unlinked
  page reachable from a project entry — owner's call at planning time.
- The page's inline `<script>` is a thin bootstrap that, on "Start",
  dynamically imports the tracker module bundle. Nothing heavy is in
  the page's initial payload.

## Code structure

```
src/tracker/
  camera.ts        request webcam (getUserMedia), return a MediaStream,
                   surface permission-denied / no-device as typed results;
                   stop() releases all tracks
  faceTracker.ts   wrap MediaPipe FaceLandmarker: init (load model+wasm),
                   detectForVideo(frame) -> { blendshapes, headMatrix,
                   faceConfidence }; dispose()
  vrmScene.ts      three.js scene: load avatar.vrm, camera framing,
                   lighting, solid-tint backdrop, render(dt); applies a
                   PoseUpdate to the model; setQuality(tier)
  mapping.ts       PURE. (rawInputs, priorState, config) -> (PoseUpdate,
                   nextState), where PoseUpdate is
                   { expressionWeights: Record<string, number>,
                     neckEuler: {x,y,z}, headEuler: {x,y,z} } and
                   priorState/nextState carry the per-value smoothing
                   history threaded explicitly (no hidden singletons, so
                   it stays testable frame-over-frame). Owns all tuning
                   constants in one exported config object. Applies
                   smoothing and ease-to-neutral on low confidence.
  degradation.ts   PURE where possible. pickTier(deviceSignals) ->
                   'strong' | 'weak'; a FrameRateWatchdog class that takes
                   fps samples and emits 'struggling' after N seconds below
                   a floor.
  trackerApp.ts    the conductor + state machine. States: intro,
                   requesting, denied, loading, running, struggling,
                   stopped, unsupported. Wires camera -> faceTracker ->
                   mapping -> vrmScene in the animation loop. Owns
                   pause/resume on visibilitychange.
```

Design rule: `camera.ts`, `faceTracker.ts`, `vrmScene.ts` are thin
adapters over browser/library APIs (not unit-tested). `mapping.ts`,
`degradation.ts`, and `trackerApp.ts`'s state-transition logic carry the
real logic and the tests.

## User flow / state machine

| State | Visitor sees | Entered when |
|---|---|---|
| **intro** | Short explanation: turns your webcam into a puppet; everything runs on your device; no video is sent anywhere; nothing is recorded. A "Start" button. An expandable "How this works / your privacy" section. | Page load |
| **requesting** | "Waiting for camera permission…" (browser shows its own prompt) | Clicked Start |
| **denied** | "No camera access. On desktop, click the camera icon in your address bar to allow it, then reload. [Try again]" | `getUserMedia` rejected, or no device |
| **loading** | "Waking up the puppet…" with a progress feel while model files (~6–8 MB total) download and initialize | Permission granted |
| **running** | The live avatar mimicking their face, inside a polaroid frame. A "Stop" button. If the face leaves frame, the avatar eases to a neutral resting pose. | Load + first successful detection |
| **struggling** | "This is running slowly on your device — it works best on a computer. [Keep going anyway]" | Frame-rate watchdog: sustained fps below floor (~12) for ~5 s. "Keep going" suppresses further nagging. |
| **stopped** | Calm state, "Start again" button, camera released | Clicked Stop |
| **unsupported** | "Your browser can't run this" (no WebGL2) or "This works best on a computer" (very weak device signals). Start button still available in the weak-device case. | Startup capability check fails |

Mobile uses the same flow with a stricter upfront capability check and a
lower quality tier. No pre-recorded fallback clip.

## Per-frame pipeline (running state)

1. **camera.ts** provides frames via a hidden, never-displayed
   `<video>`.
2. **faceTracker.ts** → `{ blendshapes: Record<string,number>,
   headMatrix: Float32Array(16), faceConfidence: number }`.
3. **mapping.ts** → `PoseUpdate`:
   - blendshapes → VRM expression weights (with smoothing)
   - headMatrix → decompose to euler → split ~30% neck / ~70% head,
     clamped to natural ranges
   - low/zero `faceConfidence` → ease all weights and rotations toward
     neutral
4. **vrmScene.ts** applies the `PoseUpdate` and renders one frame.

Tracking runs ~20–30 fps (desktop) / ~15–20 fps (mobile); rendering
runs at display rate with the avatar interpolating between tracking
updates. Smoothing eases each value toward its target; blinks get
lighter smoothing so the eyes fully close.

## Mapping (v1)

VRM models expose a **standardized expression set** (`blink` /
`blinkLeft` / `blinkRight`, `happy`, `surprised`, mouth shapes `aa` /
`ih` / `ou` / `ee` / `oh`, look directions). Mapping is written against
these presets so a model swap needs no code change.

| Visitor action | MediaPipe input | VRM output |
|---|---|---|
| Blink | `eyeBlinkLeft`, `eyeBlinkRight` | `blinkLeft`, `blinkRight` |
| Mouth open | `jawOpen` | `aa` |
| Talking (rough shapes) | `jawOpen` + `mouthPucker` + `mouthFunnel` + `mouthClose`, blended | weighted mix of `aa`/`ih`/`ou`/`ee`/`oh` |
| Smile | `mouthSmileLeft`, `mouthSmileRight` | `happy` |
| Eyebrow raise | `browInnerUp` + `browOuterUpLeft` + `browOuterUpRight` | `surprised` at reduced weight |
| Head turn / tilt / nod | facial transformation matrix | neck bone (~30%) + head bone (~70%), clamped |
| Face leaves frame | low `faceConfidence` | ease everything to neutral |

All blend weights, the neck/head split, clamp ranges, and smoothing
factors live in one exported config object in `mapping.ts`.

**Deferred (structure designed now, values added later):** eye-gaze
(`eyeLookIn/Out/Up/Down*` → look directions) and body-lean (head
translation from the matrix → slight spine-bone rotation).

**Known quality notes:** blink / head / smile will feel accurate;
"talking" reads as clearly talking but is not phoneme-accurate;
eyebrow-raise fidelity depends on the model's rig — the owner's eventual
VRoid model may expose a dedicated brow expression that can be wired
more precisely then.

## Performance & degradation

Capability tiers, chosen at startup from device signals (screen size,
`navigator.hardwareConcurrency`, a WebGL2 + renderer-string probe):

| Tier | Tracking rate | Render | MediaPipe delegate |
|---|---|---|---|
| **strong** (desktop / capable) | ~30 fps | full: antialias, one shadow-casting light | GPU |
| **weak** (mobile / low signals) | ~15–20 fps | reduced `pixelRatio`, no shadows, simpler lighting | GPU, fall back to CPU if GPU init fails |

- **Runtime watchdog** (`degradation.ts`): samples actual fps; if it
  stays below ~12 for ~5 s continuously, transition to `struggling`.
  "Keep going anyway" disables further transitions to `struggling`.
- **Hard gates before start:** no WebGL2 → `unsupported`. Very low
  device signals → `unsupported` message but Start remains available.
- **Avatar file budget:** ≤ 8 MB (documented as a VRoid export setting).
- **Focus/battery:** on `visibilitychange` to hidden (tab switch, screen
  lock) the loop pauses and the camera is released; resumes on return.

## Assets

| Path | What | Notes |
|---|---|---|
| `public/tracker/avatar.vrm` | Sample avatar for dev + launch | A verified **CC0** VRM (e.g. from `madjin/vrm-samples` or opensourceavatars.com). Owner replaces this one file with their VRoid export later. |
| `public/tracker/avatar.LICENSE.txt` | Provenance + license of the shipped sample | Committed alongside the model. |
| `public/tracker/face_landmarker.task` | MediaPipe model | ~3–4 MB, version-pinned, from Google's official distribution. |
| `public/tracker/wasm/` | MediaPipe WASM runtime | Version-pinned to match the `@mediapipe/tasks-vision` package. |

README gains a "Swapping the avatar" section: required VRM version,
texture-size / polygon guidance for the ≤ 8 MB budget, and the single
file to replace.

## Visual design (scrapbook fit)

- Uses the existing `PageLayout`.
- The 3D canvas renders inside a **polaroid-style frame** — thick white
  border, slight tilt, tape corner, soft shadow — reusing the existing
  `Polaroid` / `TapeStrip` component styling. "A photo in the scrapbook
  that happens to be alive."
- Handwritten heading in the site's display font; body copy in the
  site's serif.
- The 3D backdrop is a soft solid tint (not transparent, not textured)
  so the model reads clearly — a plain "photo backdrop."
- Start / Stop / Try again buttons reuse the site's existing button
  style.
- Respects `prefers-reduced-motion` for any page-level UI transitions
  (the avatar itself is the point, so it still animates; incidental UI
  motion is reduced).

## Privacy

- No video frames, landmarks, or derived data leave the browser —
  ever. No analytics on camera content.
- The only network requests are the one-time downloads of the model
  files from the site's own origin.
- The intro screen states this plainly before Start.
- The `<video>` element is never displayed and never persisted.
- Camera tracks are stopped on Stop, navigation away, or tab-hidden.
- No third-party scripts on the page (whole stack self-hosted).
- An expandable plain-English "how this works / your privacy" section
  on the page.

## Testing

- **Vitest unit tests:**
  - `mapping.ts` — given representative blendshape/head-matrix/confidence
    inputs, asserts the expected expression weights and bone rotations,
    including the ease-to-neutral behavior on low confidence and the
    smoothing behavior over successive frames. (Highest-value test.)
  - `degradation.ts` — `pickTier` returns the expected tier for given
    device signals; `FrameRateWatchdog` fires `struggling` at the right
    threshold and not before, and stays quiet after "keep going".
  - `trackerApp.ts` state machine — given event sequences (permission
    granted / denied, load ok / failed, fps drop, visibility change,
    stop), lands in the expected state and releases the camera where
    required.
- **Not unit-tested:** `camera.ts`, `faceTracker.ts`, `vrmScene.ts`
  (thin API adapters; mocking them tests nothing real).
- **Manual QA checklist** (README): desktop Chrome / Firefox / Safari;
  one real Android phone; one real iPhone; permission-denied path;
  no-camera path; tab-switch releases camera; face-leaves-frame eases to
  neutral; struggling-state appears on a deliberately throttled device.
- **Build:** `npm run build` passes, AND the tracker's heavy
  dependencies (`three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`)
  are confirmed absent from every non-tracker page's JS bundle
  (lazy-loading verified).

## v1 "done" criteria

- The tracker page is live, scrapbook-styled, on a chosen route.
- On a capable desktop: click Start → grant camera → within a few
  seconds the sample avatar mirrors head movement, blinks, mouth open,
  smile, and eyebrow raise, smoothly.
- Permission-denied and no-camera paths show the recovery message.
- Mobile: either runs (reduced tier) or shows the "works best on a
  computer" message; never a blank or broken screen.
- Camera is provably released on Stop / navigate-away / tab-hidden.
- The rest of the site's bundles are unchanged (no tracker code leaks
  into them).
- Swapping `avatar.vrm` for another valid VRM requires no code change.
- Eye-gaze and body-lean are not implemented, but `mapping.ts` has the
  clearly-marked extension points for them.
- Known limitation: the shipped placeholder avatar's rig lacks `joy` and
  `surprised` presets, so smile and eyebrow-raise are inert on it — they
  activate when the owner swaps in a VRoid-exported VRM (the intended
  path). Head movement, blink, and mouth shapes all work on the
  placeholder.

## Implementation notes

Deviations from this design worth recording:

- `paused` (tab-hidden) does NOT auto-resume; the visitor clicks "Start
  again". Silently re-arming a camera on tab-focus is worse than an
  explicit click.
