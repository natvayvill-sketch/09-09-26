# Living Portrait: switching from 3D to 2D

_Plan agreed 2026-10-21_

## The goal

Replace the 3D VRM avatar on the Living Portrait page with a hand-drawn 2D portrait
that still follows my face through the webcam. Do it in two phases.

## Phase 1: basic layered version (start here)

A simple puppet made of separate drawings, controlled on a 2D canvas.

- The head moves and tilts as one piece, following my head.
- The eyes and mouth swap or fade between drawings to blink, talk, smile and look surprised.
- No rigging software. Just drawing.
- Rough effort: about a day of code, plus a weekend of drawing.

## Phase 2: layered version with parallax (the final version)

Same drawings, but each layer moves at a different speed when I turn my head.
Front layers (front hair, nose) move more than back layers (back hair, ears),
which fakes depth and makes a head turn look real.

- Builds directly on Phase 1. Same code structure, same art (if it's split well).
- Still no rigging software.

## Later, optional: Live2D

If I ever want a real VTuber-style rig, the same art file can go into Live2D Cubism,
as long as the layers are split the way Live2D expects (see below). A simple first
Live2D head would take about 2–4 weekends to learn and rig.

## Drawing the art

Split it into separate layers from the start, so it works for both phases (and Live2D later):

- back hair
- face/head (with skin drawn under where the hair sits)
- ears
- eye whites, irises, upper lashes and lower lashes (each eye separately)
- closed-eye drawings (for blinking)
- eyebrows
- nose
- mouth shapes: closed, open "aa", round "ou", wide "ih", smile
- front hair / bangs
- neck and shoulders (optional)

Draw what's hidden underneath (the skin under hair, the area behind the eyelids)
so nothing shows a gap when layers move.

## How it fits the existing code

The face tracking is already kept separate from the 3D drawing, so most of the code stays:

- **Replace:** [src/tracker/vrmScene.ts](../src/tracker/vrmScene.ts), the only file that knows
  about 3D. Write a new 2D version with the same functions: `mount`, `loadAvatar`,
  `applyPose`, `render`, `setQuality`, `resize` and `dispose`.
- **Small edits:** the import in `src/tracker/trackerApp.ts` and the avatar path in
  `src/tracker/bootstrap.ts`.
- **Keep as-is:** face tracking, the state machine, UI screens, camera handling,
  the performance fallback, and the tests.
- **Mostly reuse:** `src/tracker/mapping.ts`. It already produces the values the 2D
  version needs:
  - turning left/right → slide the face features sideways
  - nodding up/down → shift the features up or down
  - tilting → rotate the head
  - blink, mouth shapes, smile, surprised → swap or fade the eye/mouth drawings
- **Optional clean-up:** if the 2D version doesn't use WebGL, remove the WebGL2 check
  and its "unsupported" screen, then remove `three` and `@pixiv/three-vrm` so the page
  downloads much less.

## Next steps

1. Draw the layers listed above.
2. Build the Phase 1 renderer and swap it in.
3. Tune it until it feels alive.
4. Add parallax for Phase 2.
