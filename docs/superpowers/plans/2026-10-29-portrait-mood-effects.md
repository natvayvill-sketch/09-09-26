# Living Portrait Mood Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Living Portrait page, the visitor's expression brings out pixel-art light and stars (smile), clouds (frown), rain (sad), and a "!" / "?" above the head (shocked / puzzled).

**Architecture:** A new `src/mood/` folder set up like `src/pet/`. Pure, tested modules turn MediaPipe blendshapes into readings (`readings.ts`), then into smoothed state and a per-frame "what to show" (`mood.ts`), then into positions (`layout.ts`). One thin DOM layer (`moodView.ts`) draws sprite strips into two layers: one behind the character canvas and one in front of it. The renderer only provides a head anchor (`VrmScene.headAnchor()`), so the effects carry over unchanged to the future 2D portrait. The tracker also gets a proper start/cleanup for `<ClientRouter />` page changes.

**Tech Stack:** TypeScript (`verbatimModuleSyntax`, no `@types/node`), vitest, three.js + @pixiv/three-vrm, Astro 7 with ClientRouter.

**Spec:** `docs/superpowers/specs/2026-10-29-portrait-mood-effects-design.md`

## Global Constraints

- Living Portrait page only (`src/pages/living-portrait.astro`); no other page changes.
- No new dependencies.
- The effects must never cover the face. Light, stars, clouds and rain sit **behind** the character canvas; "!" and "?" sit **above** the head.
- Stars and rain are never on screen together. Smile versus max(frown, sad): the stronger one wins.
- Art is pixel art in the pet format: `public/mood/<piece>.png`, one horizontal strip of square frames, frame size = image height, frame count = width ÷ height, lowercase `.png`, shown with `image-rendering: pixelated`.
- Reduced motion (`prefers-reduced-motion: reduce`): only the first frame of each piece, no sliding, twinkling or bouncing, opacity fades only, and rain becomes a soft grey tint.
- `npm test` and `npm run check` must pass. Add `src/mood/**/*` to `tsconfig.tracker.json` `include`.
- Tests that read files use the existing untyped `node:fs` import pattern from `src/pet/roster.test.ts`.

## Review Focus

1. **The face leaves the frame, or the tracker stops or pauses mid-effect:** everything retreats to the empty scene, and the view's animation loop stops once nothing is visible. Pinned in Task 3 (`null` readings decay to zero) and Task 6 (stop-loop sends `null`).
2. **The visitor navigates away from the page and comes back (ClientRouter):** the webcam turns off on leaving, the portrait works again on return, and loops and listeners don't stack up. Pinned in Task 1 (`TEARDOWN` from every state) and Task 6 (hand check).
3. **A reading hovers right at a threshold:** "!" and "?" must not flicker. Pinned in Task 3 (hysteresis tests).
4. **Talking moves the jaw:** ordinary speech (jawOpen around 0.5 with neutral eyes and brows) must not trigger "!". Pinned in Task 2.
5. **Small stage on a phone (the stage is `min(60vw, 30rem)`):** the effects scale with the stage width and stay inside the polaroid frame. Pinned in Task 4 (layout uses stage fractions) and Task 6 (hand check at 375 px).

---

### Task 1: Tracker start/cleanup for page changes

**Files:**
- Modify: `src/tracker/types.ts` (add an event)
- Modify: `src/tracker/stateMachine.ts`
- Modify: `src/tracker/trackerApp.ts`
- Modify: `src/tracker/bootstrap.ts`
- Test: `src/tracker/stateMachine.test.ts`

**Interfaces:**
- Produces: `TrackerEvent` gains `{ type: "TEARDOWN" }`. `start(opts: StartOpts): () => void` now returns a cleanup function. `bootstrap.ts` exports nothing; on import it mounts once and registers its page listeners.

- [ ] **Step 1: Write the failing test** in `stateMachine.test.ts`:

```ts
it.each(["intro", "requesting", "denied", "loading", "running", "struggling", "paused", "stopped", "error", "unsupported"] as const)(
  "%s + TEARDOWN -> stopped, stops loop and releases camera",
  (name) => {
    const r = reduce(at(name), { type: "TEARDOWN" });
    expect(r.state.name).toBe("stopped");
    expect(r.effects).toEqual(expect.arrayContaining(["stop-loop", "release-camera"]));
  },
);
```

- [ ] **Step 2: Run the test and check that it fails.** Run `npx vitest run src/tracker/stateMachine.test.ts`. Expected: the TEARDOWN cases FAIL.

- [ ] **Step 3: Implement.** In `reduce`, `case "TEARDOWN": return stop();` from any state. In `trackerApp.ts`:
  - Keep `onVisibility` and `onResize` as named handlers.
  - Add a `disposed` flag.
  - `start()` returns a cleanup that does the following: if already disposed, return; set `disposed = true`; `dispatch({ type: "TEARDOWN" })`; remove both listeners; `faceTracker?.close()`; `scene?.dispose()`; null both.
  - In `load-models`, after each `await`, if `disposed`, dispose or close whatever was just created and return without dispatching.
  - Replace the "No teardown" comment.
  - In `bootstrap.ts`, hold a module-level `cleanup: (() => void) | null`.
    - `mount()` does nothing if `cleanup` is already set or the `#lp-canvas` / `#lp-ui` / `#lp-video` elements are missing. Otherwise it sets `cleanup = start(...)`.
    - `unmount()` calls `cleanup` and resets it.
    - Register `document.addEventListener("astro:page-load", mount)` and `document.addEventListener("astro:before-swap", unmount)`, then call `mount()` once at module load. The page script runs only once under ClientRouter, so the listeners handle later visits.

- [ ] **Step 4: Run the tests.** Run `npm test && npm run check`. Expected: PASS.

- [ ] **Step 5: Hand check.** In `npm run dev`:
  1. Start the portrait.
  2. Click to another page. The webcam light goes off.
  3. Come back and press start again. The portrait runs.
  4. Repeat 3 times. In devtools Performance, the frame rate stays steady (loops aren't stacking up).

- [ ] **Step 6: Commit** with the message `Living Portrait: release the webcam and restart cleanly across page changes`.

---

### Task 2: Expression readings

**Files:**
- Create: `src/mood/types.ts`, `src/mood/settings.ts`, `src/mood/readings.ts`
- Modify: `tsconfig.tracker.json` (include `src/mood/**/*`)
- Test: `src/mood/readings.test.ts`

**Interfaces:**
- Produces:
  - `interface MoodReadings { smile: number; frown: number; sad: number; shocked: number; puzzled: number }`, each in 0..1.
  - `interface MoodSettings` and `const DEFAULT_MOOD_SETTINGS: MoodSettings` in `settings.ts`, with exactly these fields and values:
    - `gain: { smile: 1.3, frown: 1.5, sad: 1.5, shocked: 1.6, puzzledBrow: 2 }`
    - `puzzledTiltRad: 0.25`
    - `smoothingMs: 200`
    - `deadzone: 0.15`
    - `rainStart: 0.3`
    - `starCount: 7`
    - `alert: { on: 0.5, off: 0.35 }`
  - `readMood(bs: Record<string, number>, headRollRad: number, cfg?: MoodSettings): MoodReadings`.

Formulas. `avg` is the mean, missing keys count as 0, and every result is clamped to 0..1:
- smile = avg(mouthSmileLeft, mouthSmileRight) × gain.smile
- frown = avg(browDownLeft, browDownRight) × gain.frown
- sad = avg(mouthFrownLeft, mouthFrownRight) × gain.sad + max(0, browInnerUp − avg(browOuterUpLeft, browOuterUpRight)) × 0.5
- shocked = ((avg(eyeWideLeft, eyeWideRight) + avg(browInnerUp, browOuterUpLeft, browOuterUpRight)) / 2 + jawOpen) / 2 × gain.shocked
- puzzled = max(|browOuterUpLeft − browOuterUpRight| × gain.puzzledBrow, |headRollRad| / puzzledTiltRad)

- [ ] **Step 1: Write the failing tests.** `readings.test.ts`:
  - `"a neutral face reads zero everywhere"`: `readMood({}, 0)` gives every field 0.
  - `"a full smile reads as smile only"`: `{ mouthSmileLeft: 1, mouthSmileRight: 1 }` gives smile 1, and frown, sad and shocked 0.
  - `"pulled-down brows read as frown, not sad"`: `{ browDownLeft: 0.6, browDownRight: 0.6 }` gives frown ≈ 0.9 and sad 0.
  - `"droopy mouth with raised inner brows reads as sad"`: `{ mouthFrownLeft: 0.4, mouthFrownRight: 0.4, browInnerUp: 0.6 }` gives sad ≈ 0.9.
  - `"talking does not read as shocked"`: `{ jawOpen: 0.5 }` gives shocked ≈ 0.4, which is < `DEFAULT_MOOD_SETTINGS.alert.on`.
  - `"wide eyes, raised brows and open mouth read as shocked"`: eyeWide L/R 0.8, browInnerUp/OuterUp L/R 0.8, jawOpen 0.6 gives shocked ≥ 0.9.
  - `"one raised eyebrow reads as puzzled"`: `{ browOuterUpLeft: 0.4 }` gives puzzled ≈ 0.8.
  - `"a head tilt reads as puzzled, either way"`: `readMood({}, 0.25).puzzled` ≈ 1, and `readMood({}, -0.125).puzzled` ≈ 0.5.

- [ ] **Step 2: Run the tests and check that they fail.** Run `npx vitest run src/mood/readings.test.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `types.ts`, `settings.ts` and `readMood` as specified above.

- [ ] **Step 4: Run the tests.** Run `npm test && npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `Mood effects: read smile, frown, sad, shocked and puzzled from the face`.

---

### Task 3: Smoothing, on/off and "what to show"

**Files:**
- Create: `src/mood/mood.ts`
- Modify: `src/mood/types.ts`
- Test: `src/mood/mood.test.ts`

**Interfaces:**
- Consumes: `MoodReadings`, `MoodSettings`, `DEFAULT_MOOD_SETTINGS` (Task 2).
- Produces:
  - `interface MoodState { smoothed: MoodReadings; exclaim: boolean; question: boolean }`
  - `interface MoodFrame { light: number; stars: number; clouds: number; rain: number; exclaim: boolean; question: boolean }`. `stars` is an integer from 0 to starCount; the others are 0..1.
  - `createMoodState(): MoodState` (all zero, both alerts off).
  - `stepMood(prev: MoodState, readings: MoodReadings | null, dtMs: number, cfg?: MoodSettings): MoodState`
  - `moodFrame(state: MoodState, cfg?: MoodSettings): MoodFrame`

Rules:
- **Smoothing:** each reading eases towards its target with `k = 1 − exp(−dtMs / smoothingMs)`. A `null` reading means the target is 0 for every field.
- **Alert on/off:** `exclaim` turns on when smoothed shocked ≥ `alert.on` and turns off when it drops below `alert.off`. `question` works the same way using puzzled. Between the two thresholds, each keeps its previous value.
- **Background (`moodFrame`):**
  1. Apply the deadzone: `d(v) = v < deadzone ? 0 : (v − deadzone) / (1 − deadzone)`. Let `pos = d(smile)` and `neg = d(max(frown, sad))`.
  2. If `pos > neg`: `light = pos` and `stars = ceil(pos × starCount)`. Clouds and rain are 0.
  3. Otherwise: `clouds = neg` and `rain = d(sad) > rainStart ? (d(sad) − rainStart) / (1 − rainStart) : 0`. Light and stars are 0.

- [ ] **Step 1: Write the failing tests.** `mood.test.ts`, with a helper `settle(readings, ms = 3000)` that steps `createMoodState()` in 16 ms steps:
  - `"a neutral face shows nothing"`: `moodFrame(settle(neutral))` gives every number 0 and both alerts false.
  - `"a small smile brings out the centre star only, a big one brings out all 7"`: settled smile 0.25 gives stars 1. Smile 1 gives stars 7 and light 1.
  - `"a frown brings clouds but no rain"`: frown 0.8 gives clouds > 0.7 and rain 0.
  - `"only sad makes it rain, from a cloud"`: sad 0.9 gives clouds > 0.8 and rain > 0.5.
  - `"smile and frown together: the stronger one wins, never stars with rain"`: smile 0.9 with sad 0.5 gives stars > 0 and rain 0. Smile 0.3 with sad 0.9 gives stars 0 and rain > 0.
  - `"alerts don't flicker between thresholds"`: settle shocked 0.6 (exclaim true), then settle 0.4, and exclaim is still true. Settle 0.3, and exclaim is false. Then settle 0.4, and it stays false.
  - `"! and ? can both be on"`: shocked 0.8 with puzzled 0.8 gives exclaim and question both true.
  - `"null readings (no face) fade everything back to empty"`: settle a full smile, then `settle(null)`, and `moodFrame` is all zero.
  - `"reacts a beat late, not instantly"`: one 16 ms step from neutral to smile 1 gives smoothed smile < 0.15.

- [ ] **Step 2: Run the tests and check that they fail.** Run `npx vitest run src/mood/mood.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `createMoodState`, `stepMood` and `moodFrame` as specified.

- [ ] **Step 4: Run the tests.** Run `npm test && npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `Mood effects: smoothing, no-flicker alerts, and stars-versus-rain`.

---

### Task 4: Layout around the head

**Files:**
- Create: `src/mood/layout.ts`
- Modify: `src/mood/types.ts`
- Test: `src/mood/layout.test.ts`

**Interfaces:**
- Produces:
  - `interface HeadAnchor { x: number; y: number; size: number; roll: number }`. `x` and `y` are the head centre as fractions of the stage (0..1, and may go past the edges). `size` is the head height as a fraction of stage height. `roll` is the screen-space tilt in radians.
  - `interface Spot { x: number; y: number }`, in stage fractions.
  - `starArc(anchor: HeadAnchor, total: number): Spot[]`. Returns `total` spots ordered **centre-first**, then alternating left and right outwards. Angles from straight up are `0, −25, +25, −50, +50, −75, +75` degrees, plus `anchor.roll`. Radius = `anchor.size × 0.85`, so `x = anchor.x + sin(a) × r` and `y = anchor.y − cos(a) × r`. The first `frame.stars` spots are the ones shown, so outer stars leave first.
  - `alertSpots(anchor: HeadAnchor, exclaim: boolean, question: boolean): { exclaim?: Spot; question?: Spot }`. Uses `y = anchor.y − anchor.size × 0.75`. When both are on, they sit at `anchor.x ∓ anchor.size × 0.175`, "!" on the left. When only one is on, it sits at `anchor.x`.
  - `cloudX(strength: number, side: "left" | "right", anchor: HeadAnchor, cloudW: number, spill: number): number`. Returns the cloud's centre x in stage fractions. At strength 0 the cloud is fully outside the visible area: centre at `−spill − cloudW / 2` (left) or `1 + spill + cloudW / 2` (right). At strength 1 it reaches `anchor.x ∓ anchor.size × 0.6`. In between it interpolates linearly.

- [ ] **Step 1: Write the failing tests.** `layout.test.ts` uses `const head = { x: 0.5, y: 0.45, size: 0.4, roll: 0 }`:
  - `"the first star sits straight above the head"`: `starArc(head, 7)[0]` gives x ≈ 0.5 and y ≈ 0.45 − 0.34.
  - `"stars come in mirrored pairs"`: spots 1 and 2 have x values that mirror around 0.5 and equal y values.
  - `"the arc follows a head tilt"`: with `roll: 0.2`, spot 0 has x > 0.5.
  - `"alone, ! is centred; together, ! is left and ? is right"`
  - `"clouds start fully outside the frame and come in towards the head"`: `cloudX(0, "left", head, 0.3, 0.05)` ≈ −0.2, and `cloudX(1, "left", head, 0.3, 0.05)` ≈ 0.26. The right side mirrors this.

- [ ] **Step 2: Run the tests and check that they fail.** Run `npx vitest run src/mood/layout.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `starArc`, `alertSpots` and `cloudX`.

- [ ] **Step 4: Run the tests.** Run `npm test && npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `Mood effects: star arc, alert and cloud positions around the head`.

---

### Task 5: Placeholder pixel art

**Files:**
- Create: `scripts/png.mjs` (the `crc32`, `chunk` and `encodePng` helpers, moved out of `make-placeholder-pets.mjs`)
- Modify: `scripts/make-placeholder-pets.mjs` (import from `./png.mjs`; output unchanged)
- Create: `scripts/make-placeholder-mood.mjs`
- Create: `src/mood/pieces.ts`
- Create: `public/mood/{light,star,cloud,drop,exclaim,question}.png` (generated)
- Test: `src/mood/pieces.test.ts`

**Interfaces:**
- Produces:
  - `type PieceId = "light" | "star" | "cloud" | "drop" | "exclaim" | "question"`
  - `interface PieceDef { id: PieceId; frameSize: number; fps: number }`
  - `const PIECES: Record<PieceId, PieceDef>` with these values:
    - light: 64 px, 2 fps (2 frames: a stepped, dithered warm glow)
    - star: 16 px, 6 fps (4-frame twinkle)
    - cloud: 48 px, 2 fps (2-frame puff)
    - drop: 8 px, 1 fps (1 frame)
    - exclaim: 16 px, 4 fps (2-frame wobble)
    - question: 16 px, 4 fps (2-frame wobble)
  - `pieceUrl(id: PieceId): string` returns `/mood/<id>.png`.
  - Clouds are drawn light grey. Their darkness comes from a CSS filter in Task 6, so only one cloud strip is needed.

- [ ] **Step 1: Write the failing test.** `pieces.test.ts`, `"every piece has a correctly named, correctly sized strip"`, mirrors the PNG check in `src/pet/roster.test.ts`. It checks `readdirSync("public/mood")` for an exact lowercase name match. It reads the header width and height, then checks that height = `frameSize` and that width is a multiple of `frameSize`.

- [ ] **Step 2: Run the test and check that it fails.** Run `npx vitest run src/mood/pieces.test.ts`. Expected: FAIL (the module and files are missing).

- [ ] **Step 3: Implement.**
  1. Move the PNG helpers into `scripts/png.mjs`.
  2. Run `node scripts/make-placeholder-pets.mjs`, then confirm with `git status --short public/pets` that the pet PNGs are byte-for-byte unchanged.
  3. Write `make-placeholder-mood.mjs`, using the frame counts above and transparent backgrounds.
  4. Run it, and write `pieces.ts`.

- [ ] **Step 4: Run the tests.** Run `npm test && npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `Mood effects: placeholder pixel-art strips`.

---

### Task 6: Draw it on the portrait

**Files:**
- Modify: `src/tracker/vrmScene.ts` (transparent canvas, camera zoom-out, `headAnchor()`)
- Create: `src/mood/moodView.ts`
- Modify: `src/tracker/trackerApp.ts`, `src/tracker/bootstrap.ts`
- Modify: `src/pages/living-portrait.astro` (two layer elements and their CSS)

**Interfaces:**
- Consumes: `readMood`, `createMoodState`, `stepMood`, `moodFrame`, `starArc`, `alertSpots`, `cloudX`, `PIECES`, `pieceUrl`, and `HeadAnchor`.
- Produces:
  - `VrmScene.headAnchor(): HeadAnchor | null` (null before the avatar loads).
  - `createMoodView(opts: { back: HTMLElement; front: HTMLElement; stage: HTMLElement }): MoodView`, with `interface MoodView { update(input: { blendshapes: Record<string, number>; headRollRad: number; anchor: HeadAnchor | null } | null): void; dispose(): void }`.
  - `StartOpts` gains `moodBack?: HTMLElement` and `moodFront?: HTMLElement`.

- [ ] **Step 1: Make room in the frame and make the canvas see-through.**
  - Camera: `position.set(0, 1.38, 1.35)`, `lookAt(0, 1.38, 0)`.
  - Renderer: `alpha: true`, `setClearColor(0x000000, 0)`, and remove `scene.background`. `.lp-stage` already paints `#e9dcc2` behind it.
  - Add `headAnchor()`. Project the head bone's world position, raised 0.08 m, to NDC, then map it to stage fractions (`x = (ndc.x + 1) / 2`, `y = (1 − ndc.y) / 2`). `size` = the projected height of 0.25 m at the head. `roll` = the head bone's world roll about the view axis.

- [ ] **Step 2: Add the layers.** Inside `.lp-stage` in `living-portrait.astro`, put `<div id="lp-mood-back" class="lp-mood" aria-hidden="true"></div>` **before** the canvas, and `<div id="lp-mood-front" class="lp-mood" aria-hidden="true"></div>` after it, before `#lp-ui`.
  - `.lp-mood`: `position: absolute; inset: calc(-1 * var(--space-3)); overflow: hidden; pointer-events: none;` (it spills onto the polaroid border, up to its outer edge).
  - Stacking order: back z 0, canvas `position: relative; z-index: 1`, front z 2, `.lp-ui` z 3.

- [ ] **Step 3: Implement `moodView.ts`.**
  - **The loop:** the view keeps a `MoodState` and runs its own `requestAnimationFrame` loop only while the input is non-null or anything is still visible, and stops itself once everything is gone.
  - **Each frame:** call `readMood`, then `stepMood`, then `moodFrame`, and draw the result:
    - **Light:** centred on the anchor, opacity = `light`.
    - **Stars:** at `starArc` spots. Each shown star slides out from the head centre over about 600 ms with an overshoot easing, and slides back the same way when it stops being shown.
    - **Clouds:** 2 per side at slightly different heights and sizes, positioned with `cloudX`. Use `filter: brightness(1 − 0.55 × clouds)`.
    - **Rain:** `round(rain × 30)` drops falling from under the clouds, across the layer.
    - **"!" and "?":** at `alertSpots`, in the **front** layer. Each pops from the anchor top in about 250 ms with a bounce, and shrinks back down into the head.
  - **Sprites:** frame size = `PIECES[id].frameSize`. On-screen pixel scale = `stageWidthPx / 160`. Use `image-rendering: pixelated`. Animate frames with `background-position`, the same as `petView.ts`.
  - **Reduced motion:** read `matchMedia("(prefers-reduced-motion: reduce)")` live. Show first frames only, fade opacity in place, no slide or bounce, and replace the rain with a grey overlay at opacity `rain × 0.35`.
  - **No anchor yet:** fall back to `{ x: 0.5, y: 0.4, size: 0.35, roll: 0 }`.
  - **Debug readout:** with `?mood-debug` in the URL, show a small readout of the five smoothed readings in the front layer, for tuning.

- [ ] **Step 4: Wire it up.**
  - `bootstrap.ts` passes `#lp-mood-back` and `#lp-mood-front`.
  - In `trackerApp.ts`, create the view in `start()` when both layers are present.
  - In the loop, after `mapFaceToPose`, call `mood.update(...)`:
    - If `lastRaw.faceConfidence < DEFAULT_MAPPING_CONFIG.confidenceFloor`, pass `null`.
    - Otherwise pass `{ blendshapes: lastRaw.blendshapes, headRollRad: lastRaw.headMatrix ? matrixToEuler(lastRaw.headMatrix).z : 0, anchor: scene.headAnchor() }`.
  - `stop-loop` calls `mood.update(null)`. The Task 1 cleanup calls `mood.dispose()`.

- [ ] **Step 5: Run the checks.** Run `npm test && npm run check && npm run build`. Expected: all PASS.

- [ ] **Step 6: Hand check.** In `npm run dev` at `/living-portrait?mood-debug`:
  1. The character is a little smaller, with clear space above the head.
  2. Smile slightly, then fully. Stars come out from the centre first, and leave outer-first.
  3. Frown. Clouds come in from the polaroid edges and darken, with no rain.
  4. Look sad. Rain falls.
  5. Smile while sad. The stronger one wins, and stars and rain never show together.
  6. Shocked face. "!" pops up.
  7. Raise one eyebrow or tilt your head. "?" pops up. Do both, and "!?" appears side by side.
  8. Talking normally doesn't pop "!".
  9. Lean and turn. The arc and alerts follow the head.
  10. Turn on reduced motion in the OS. Effects only fade, and rain is a grey tint.
  11. Cover the camera. Everything retreats.
  12. At a 375 px wide window, the effects scale down and stay inside the polaroid.
  13. Nothing ever covers the face.

  Use the debug readout to adjust `DEFAULT_MOOD_SETTINGS` if a face doesn't trigger. Puzzled is the most likely to need it. If you change any values, update the Task 2 and Task 3 tests to match.

- [ ] **Step 7: Commit** with the message `Living Portrait: mood effects around the character`.
