import type { HeadAnchor, MoodFrame, MoodState } from "./types";
import { readMood } from "./readings";
import { createMoodState, moodFrame, stepMood } from "./mood";
import { alertSpots, cloudX, starArc } from "./layout";
import { PIECES, pieceUrl, type PieceId } from "./pieces";
import { DEFAULT_MOOD_SETTINGS } from "./settings";

export interface MoodInput {
  blendshapes: Record<string, number>;
  headRollRad: number;
  anchor: HeadAnchor | null;
}

export interface MoodView {
  /** Latest face reading; null = no face or tracker stopped (everything retreats). */
  update(input: MoodInput | null): void;
  dispose(): void;
}

/** Used until the renderer reports where the head is. */
const FALLBACK_ANCHOR: HeadAnchor = { x: 0.5, y: 0.4, size: 0.35, roll: 0 };
/** Pixel-art scale: one art pixel per this fraction of the stage width. */
const ART_PX_PER_STAGE = 160;
const STAR_SLIDE_MS = 600;
const ALERT_POP_MS = 250;
/** Light, clouds and rain ease towards their targets over this long, so the losing side retreats. */
const FADE_MS = 400;
const MAX_DROPS = 30;
/** Clouds per side: [vertical offset in head sizes, scale relative to the art scale]. */
const CLOUDS: readonly (readonly [number, number])[] = [
  [-0.55, 1],
  [0.05, 0.75],
];

/** Overshoots a little then settles, for things popping out. */
function easeOutBack(t: number): number {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Moves `p` towards `target` (0 or 1) at a rate that covers 0..1 in `ms`. */
const approach = (p: number, target: number, dtMs: number, ms: number): number =>
  target > p ? Math.min(target, p + dtMs / ms) : Math.max(target, p - dtMs / ms);

interface Sprite {
  el: HTMLDivElement;
  id: PieceId;
}

export function createMoodView(opts: {
  back: HTMLElement;
  front: HTMLElement;
  stage: HTMLElement;
}): MoodView {
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const debug = new URLSearchParams(location.search).has("mood-debug");
  const frameCounts: Partial<Record<PieceId, number>> = {};
  for (const def of Object.values(PIECES)) {
    const img = new Image();
    img.onload = () => {
      frameCounts[def.id] = Math.max(1, Math.floor(img.naturalWidth / def.frameSize));
    };
    img.src = pieceUrl(def.id);
  }

  function sprite(id: PieceId, parent: HTMLElement): Sprite {
    const el = document.createElement("div");
    // Inline styles: elements made here don't get the page's scoped CSS.
    Object.assign(el.style, {
      position: "absolute",
      left: "0",
      top: "0",
      opacity: "0",
      backgroundImage: `url("${pieceUrl(id)}")`,
      backgroundRepeat: "no-repeat",
      imageRendering: "pixelated",
      transformOrigin: "50% 50%",
      willChange: "transform, opacity",
    });
    parent.appendChild(el);
    return { el, id };
  }

  const light = sprite("light", opts.back);
  const clouds = (["left", "right"] as const).flatMap((side) =>
    CLOUDS.map(([dy, scale]) => ({ side, dy, scale, s: sprite("cloud", opts.back) })),
  );
  const stars = Array.from({ length: DEFAULT_MOOD_SETTINGS.starCount }, () => ({
    s: sprite("star", opts.back),
    p: 0,
  }));
  const drops = Array.from({ length: MAX_DROPS }, () => sprite("drop", opts.back));
  const tint = document.createElement("div");
  Object.assign(tint.style, {
    position: "absolute",
    inset: "0",
    background: "rgb(110, 120, 140)",
    opacity: "0",
  });
  opts.back.appendChild(tint);
  const exclaim = { s: sprite("exclaim", opts.front), p: 0 };
  const question = { s: sprite("question", opts.front), p: 0 };
  const readout = debug ? document.createElement("pre") : null;
  if (readout) {
    Object.assign(readout.style, {
      position: "absolute",
      left: "4px",
      bottom: "4px",
      margin: "0",
      font: "11px/1.3 monospace",
      background: "rgba(255,255,255,0.8)",
      padding: "2px 4px",
    });
    opts.front.appendChild(readout);
  }

  let state: MoodState = createMoodState();
  let input: MoodInput | null = null;
  let anchor: HeadAnchor = FALLBACK_ANCHOR;
  let rafId = 0;
  let lastTs = 0;
  let clockMs = 0;
  /** Eased on-screen values of the frame's light, clouds and rain. */
  const shown = { light: 0, clouds: 0, rain: 0 };

  /** Places a sprite centred on (x, y) in layer px. */
  function place(
    sp: Sprite,
    x: number,
    y: number,
    artScale: number,
    opacity: number,
    grow = 1,
    loopFrames = true,
  ): void {
    const def = PIECES[sp.id];
    const size = def.frameSize * artScale;
    const count = frameCounts[sp.id] ?? 1;
    const frame =
      reducedQuery.matches || !loopFrames ? 0 : Math.floor((clockMs / 1000) * def.fps) % count;
    const st = sp.el.style;
    st.width = `${size}px`;
    st.height = `${size}px`;
    st.backgroundSize = `${count * size}px ${size}px`;
    st.backgroundPosition = `${-frame * size}px 0`;
    st.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${grow})`;
    st.opacity = String(opacity);
  }

  function render(frame: MoodFrame, dtMs: number): void {
    const reduced = reducedQuery.matches;
    const stageW = opts.stage.clientWidth;
    const stageH = opts.stage.clientHeight;
    if (!stageW || !stageH) return;
    // The layers spill past the stage onto the polaroid border.
    const offX = -opts.back.offsetLeft;
    const offY = -opts.back.offsetTop;
    const layerW = opts.back.clientWidth;
    const layerH = opts.back.clientHeight;
    const toX = (fx: number): number => fx * stageW + offX;
    const toY = (fy: number): number => fy * stageH + offY;
    const art = stageW / ART_PX_PER_STAGE;
    for (const key of ["light", "clouds", "rain"] as const) {
      const step = dtMs / FADE_MS;
      const diff = frame[key] - shown[key];
      shown[key] = Math.abs(diff) <= step ? frame[key] : shown[key] + Math.sign(diff) * step;
    }

    // Light: grows with the smile, behind the head.
    place(light, toX(anchor.x), toY(anchor.y), art * 1.5, shown.light, reduced ? 1 : 0.6 + 0.4 * shown.light);

    // Stars: centre-first, each sliding out from behind the head.
    const spots = starArc(anchor, stars.length);
    stars.forEach((star, i) => {
      star.p = approach(star.p, i < frame.stars ? 1 : 0, dtMs, STAR_SLIDE_MS);
      const spot = spots[i]!;
      if (reduced) {
        place(star.s, toX(spot.x), toY(spot.y), art, star.p);
      } else {
        const t = easeOutBack(star.p);
        place(
          star.s,
          toX(lerp(anchor.x, spot.x, t)),
          toY(lerp(anchor.y, spot.y, t)),
          art,
          Math.min(1, star.p * 2),
          star.p,
        );
      }
    });

    // Clouds: drift in from outside the frame towards the head, darkening.
    const spill = offX / stageW;
    for (const c of clouds) {
      const w = (PIECES.cloud.frameSize * art * c.scale) / stageW;
      const x = cloudX(reduced ? 1 : shown.clouds, c.side, anchor, w, spill);
      const sp = c.s;
      place(sp, toX(x), toY(anchor.y + c.dy * anchor.size), art * c.scale, reduced ? shown.clouds : shown.clouds > 0 ? 1 : 0);
      sp.el.style.filter = `brightness(${1 - 0.55 * shown.clouds})`;
    }

    // Rain: drops falling from under the clouds, or a grey tint under reduced motion.
    const dropCount = reduced ? 0 : Math.round(shown.rain * MAX_DROPS);
    const topY = toY(anchor.y - anchor.size * 0.3);
    drops.forEach((d, i) => {
      if (i >= dropCount) {
        d.el.style.opacity = "0";
        return;
      }
      const speed = 0.0012 + (i % 5) * 0.0002; // layer heights per ms
      const fall = (clockMs * speed + i * 0.37) % 1;
      const x = ((i * 37) % 100) / 100;
      place(d, x * layerW, topY + fall * (layerH - topY), art, 1, 1, false);
    });
    tint.style.opacity = String(reduced ? shown.rain * 0.35 : 0);

    // "!" and "?": pop up from the top of the head, side by side when both show.
    const present = alertSpots(anchor, exclaim.p > 0 || frame.exclaim, question.p > 0 || frame.question);
    const headTop = anchor.y - anchor.size * 0.45;
    for (const [alert, on, spot] of [
      [exclaim, frame.exclaim, present.exclaim],
      [question, frame.question, present.question],
    ] as const) {
      alert.p = approach(alert.p, on ? 1 : 0, dtMs, ALERT_POP_MS);
      if (!spot) {
        alert.s.el.style.opacity = "0";
        continue;
      }
      if (reduced) {
        place(alert.s, toX(spot.x), toY(spot.y), art, alert.p);
      } else {
        const t = easeOutBack(alert.p);
        place(alert.s, toX(spot.x), toY(lerp(headTop, spot.y, t)), art, Math.min(1, alert.p * 2), alert.p);
      }
    }

    if (readout) {
      readout.textContent = Object.entries(state.smoothed)
        .map(([k, v]) => `${k.padEnd(8)}${v.toFixed(2)}`)
        .join("\n");
    }
  }

  function idle(frame: MoodFrame): boolean {
    return (
      !input &&
      frame.light === 0 &&
      frame.stars === 0 &&
      frame.clouds === 0 &&
      shown.light === 0 &&
      shown.clouds === 0 &&
      shown.rain === 0 &&
      !frame.exclaim &&
      !frame.question &&
      stars.every((s) => s.p === 0) &&
      exclaim.p === 0 &&
      question.p === 0
    );
  }

  function tick(now: number): void {
    const dtMs = Math.min(Math.max(now - lastTs, 0), 100);
    lastTs = now;
    clockMs += dtMs;
    const readings = input ? readMood(input.blendshapes, input.headRollRad) : null;
    state = stepMood(state, readings, dtMs);
    if (input?.anchor) anchor = input.anchor;
    const frame = moodFrame(state);
    render(frame, dtMs);
    rafId = idle(frame) ? 0 : requestAnimationFrame(tick);
  }

  return {
    update(next) {
      input = next;
      if (!rafId && (next || !idle(moodFrame(state)))) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    },
    dispose() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      opts.back.replaceChildren();
      opts.front.replaceChildren();
    },
  };
}
