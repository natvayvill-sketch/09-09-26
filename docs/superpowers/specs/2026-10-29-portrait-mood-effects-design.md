# Living Portrait Mood Effects — Design

_Date: 2026-10-29_

## Goal

On the Living Portrait page, the visitor's facial expression changes the scene around the
character. A smile brings out light and stars. A frown pulls in clouds, and a sad face makes
it rain. Shock and puzzlement pop a "!" or "?" above the head. The effects add feeling and
charm. They must never cover the character's face or get in the way of the portrait.

## Effects

| Expression | What it looks like | Strength |
|---|---|---|
| **Smile** | A soft light glows behind the head. Stars come out from behind the head into an arc around it, and twinkle while the smile lasts. | Follows the smile: a small smile brings out the stars nearest the top of the head, and a big grin brings out the whole arc down both sides. The light grows with it. When the smile fades the stars slide back behind the head, outer ones first. |
| **Frown** (brows pulled down and together) | Clouds drift in from outside the left and right edges of the frame towards the back of the head, staying behind it. | The deeper the frown, the further in they come and the darker they get. They drift back out when it relaxes. |
| **Sad** (mouth corners down, inner brows raised) | Rain falls. A sad face also brings the clouds in, so rain never falls from a clear sky. | The sadder the face, the heavier the rain. Only a sad face makes it rain. |
| **Shocked** (eyes wide, brows up, mouth dropping open) | A "!" springs up from the top of the head with a little bounce, like a cartoon alert. | On or off, never half-size. It stays while the face lasts, then shrinks back down into the head. |
| **Puzzled** (one eyebrow raised higher than the other, and/or a head tilt) | A "?" pops up from the top of the head, the same way as the "!". | On or off. |

### How effects combine

- **Smile versus frown/sad:** the stronger one wins, so stars and rain never show together.
  The losing effect retreats as normal.
- **"!" and "?"** are independent of the background effects and can show on top of stars
  or clouds (for example, happy surprise).
- **"!" and "?" together:** both show, side by side above the head ("!?"). Each one comes
  and goes on its own. When only one shows, it is centred above the head.

## Behaviour rules (all effects)

- **Layering:** the light, stars, clouds and rain are drawn **behind** the character. The
  "!" and "?" are drawn **above** the head. Nothing covers the face.
- **Follows the head:** the star arc, the light and the "!"/"?" stay anchored to the
  character's head as it leans and turns, not to a fixed point in the frame. Clouds come in
  from the frame edges but aim at the head's position.
- **No flicker:** each effect reacts a beat after an expression starts and stops (smoothing
  plus separate on/off thresholds), so a jittery reading doesn't make things blink in and out.
- **Reduced motion** (`prefers-reduced-motion: reduce`): effects fade in and out in place.
  No sliding, twinkling or bouncing. Rain becomes a soft grey tint instead of falling drops.
- **No face / tracker stopped:** everything retreats back to the empty scene.

## How it's built

_These are the builder's calls, agreed in conversation; details are left to the plan._

- **Living Portrait page only**, driven by the existing face tracker in `src/tracker/`.
  MediaPipe already outputs every blendshape needed: `mouthSmile*`, `browDown*`,
  `mouthFrown*`, `browInnerUp`, `browOuterUp*`, `eyeWide*`, `jawOpen`, plus the head matrix
  for tilt.
- **Separate from the character renderer.** The effects must keep working, unchanged, when
  the portrait moves from the 3D VRM model to the planned 2D layered character
  (`docs/living-portrait-2d-plan.md`). The renderer only has to tell the effects where the
  head is on the stage (a screen-space anchor, plus head tilt). For the VRM, that means
  projecting the head bone's position through the camera each frame.
- **See-through character layer.** The VRM canvas is currently opaque with a painted
  background colour (`scene.background = #e9dcc2`, `alpha: false`). It becomes transparent,
  and the paper colour moves to the page behind it, so the background effects can sit between
  the paper and the character.
- **Same structure as `src/tracker/` and `src/pet/`:** a pure, unit-tested module
  ("expression readings → which effects, how strong") kept separate from a thin layer that
  draws on the page.
- **Framing (decided):** zoom the portrait camera out **a little** to make room above and
  beside the head, and let the effects **spill a little past the picture onto the polaroid
  border**. The effects layer is therefore not clipped to `.lp-stage`; it extends slightly
  beyond it but stays within `.lp-frame`. The 2D character, when it comes, should be framed
  with the same headroom.
- **Art (decided): pixel art, for a cartoon feel,** in the same format as the pet sprites:
  each piece (light, star, cloud, raindrop, "!", "?") is its own folder of horizontal PNG
  strips, frame count = width ÷ frame size, shown scaled up with
  `image-rendering: pixelated`. Twinkle, bounce and rain play as frame animations; the code
  moves, scales and fades the pieces. Start with generated placeholder strips (like
  `scripts/make-placeholder-pets.mjs`) so the code doesn't wait on the art.
  _Builder's call:_ frame sizes per piece (e.g. 16 px for star, drop, "!" and "?"; larger for
  cloud and light), and under reduced motion each piece shows its first frame only.
- **Pop-up ("!" and "?") — builder's call:** they may briefly overlap the hair as they spring
  up and shrink back; no head-shaped mask. They never touch the face. The renderer only
  provides the head anchor, tilt and head size.
- **Page lifecycle — builder's call, in scope:** the site uses `<ClientRouter />`, but
  `trackerApp.ts` assumes full page loads (no cleanup on leaving, may not restart on return,
  webcam may stay on). Fix this as part of the work, giving the tracker and the effects a
  proper start/stop/cleanup on page entry and exit, so animation loops don't pile up and the
  webcam is released.
- **Tuning:** each expression's thresholds live in one settings object so they can be
  adjusted. Puzzled is the subtlest face for the camera and will most likely need tuning.
  Provide an easy way to see the live readings while tuning.

## Goals and non-goals

- **Goal:** the five effects above, behaving as described, on the Living Portrait page.
- **Not now:** effects on other pages; sound; more expressions (easy to add later);
  final art.
- **Would count as failure even if it works technically:** effects covering the face;
  effects flickering on and off; stars and rain on screen together; the effects having to be
  rebuilt when the portrait moves to 2D.

## Testing

- Unit tests for the pure module: each expression's detection, the strength curves (stars
  appearing in order with smile strength, cloud darkness, rain only on sad), smile versus
  frown/sad winning, "!" and "?" showing together, and the no-flicker on/off thresholds.
- Checked by hand on the page: each expression in front of the webcam, leaning and turning
  (effects follow the head), reduced motion, and the face leaving the frame.
