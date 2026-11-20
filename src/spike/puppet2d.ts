// THROWAWAY SPIKE: a 2D layered puppet for the Living Portrait, drawn on a
// plain 2D canvas from the parts exported out of vtuber.psd. Blinking and the
// talking mouth are faked by squashing/moving the existing parts until Lee
// draws closed eyes and mouth shapes. Not wired into the real page yet.
import type { PoseUpdate } from "../tracker/types";

interface PartInfo {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  unfinished: boolean;
}
interface Manifest {
  width: number;
  height: number;
  parts: PartInfo[];
}
interface Part extends PartInfo {
  img: HTMLImageElement;
}

/** How far each part slides when the head turns: + moves with the face, - moves against it (sits behind). */
const DEPTH: Record<string, number> = {
  halo: -0.55,
  "hair-back": -0.3,
  head: 0.05,
  earrings: 0.05,
  "eye-white-l": 0.34, "eye-white-r": 0.34,
  "eyelid-l": 0.34, "eyelid-r": 0.34,
  "lash-lower-l": 0.35, "lash-lower-r": 0.35,
  "lash-upper-l": 0.36, "lash-upper-r": 0.36,
  "brow-l": 0.38, "brow-r": 0.38,
  "mouth-inside": 0.4, "lip-lower": 0.4, "lip-upper": 0.4,
  nose: 0.55,
  crown: 0.5,
  "hair-curl": 0.5,
  "hair-front": 0.45,
};
const IRIS_EXTRA_DEPTH = 0.1;
const BODY = new Set(["sleeve-back-r", "sleeve-back-l", "sleeve-puff-r", "sleeve-puff-l", "torso", "tassels"]);
const HAIR = new Set(["hair-back", "hair-front", "hair-curl"]);
/** Drawn as part of the eye or mouth composites, not on their own. */
const COMPOSITED = new Set(["iris-l", "iris-r", "highlight-l", "highlight-r", "teeth-top", "teeth-bottom"]);

/** Region of the 1500x2000 artwork shown in the canvas. */
const VIEW = { x: 0, y: 230, w: 1500, h: 1770 };
const NECK = { x: 750, y: 1225 };
const HEAD_TOP = { x: 750, y: 760 };
/** Pixels (artwork space) a depth-1 part slides per radian of turn / nod. */
const K_YAW = 120;
const K_PITCH = 85;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface Puppet {
  mount(canvas: HTMLCanvasElement): void;
  load(base: string): Promise<void>;
  applyPose(pose: PoseUpdate): void;
  render(dtSeconds: number): void;
  resize(cssWidth: number, cssHeight: number): void;
  setShowUnfinished(show: boolean): void;
  setAutoBlink(on: boolean): void;
  dispose(): void;
}

export function createPuppet(): Puppet {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let parts: Part[] = [];
  const byName = new Map<string, Part>();
  let showUnfinished = false;
  let autoBlink = false;

  // Pose
  let yaw = 0, pitch = 0, roll = 0;
  let w: Record<string, number> = {};

  // Life
  let t = 0;
  let hairLag = 0, hairVel = 0;
  let nextBlinkAt = 2, blinkT = -1;

  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d")!;

  function off(width: number, height: number): CanvasRenderingContext2D {
    scratch.width = Math.ceil(width);
    scratch.height = Math.ceil(height);
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    return sctx;
  }

  function parallax(name: string): { dx: number; dy: number } {
    const d = DEPTH[name] ?? 0;
    return { dx: yaw * d * K_YAW, dy: pitch * d * K_PITCH };
  }

  function drawEye(c: CanvasRenderingContext2D, side: "l" | "r", blink: number): void {
    const white = byName.get(`eye-white-${side}`);
    const iris = byName.get(`iris-${side}`);
    const shine = byName.get(`highlight-${side}`);
    if (!white) return;
    // Iris and highlight, clipped to the eye white.
    const o = off(white.w, white.h);
    o.drawImage(white.img, 0, 0);
    o.globalCompositeOperation = "source-atop";
    const gaze = yaw * IRIS_EXTRA_DEPTH * K_YAW;
    if (iris) o.drawImage(iris.img, iris.x - white.x + gaze, iris.y - white.y + pitch * IRIS_EXTRA_DEPTH * K_PITCH);
    if (shine && blink < 0.6) o.drawImage(shine.img, shine.x - white.x + gaze, shine.y - white.y);
    o.globalCompositeOperation = "source-over";

    // Blink: squash the eye towards the lower lid.
    const { dx, dy } = parallax(white.name);
    const pivotY = white.y + white.h * 0.72;
    c.save();
    c.translate(white.x + dx, pivotY + dy);
    c.scale(1, Math.max(0.001, 1 - blink));
    c.drawImage(scratch, 0, -(pivotY - white.y));
    c.restore();
  }

  function drawUpperLash(c: CanvasRenderingContext2D, part: Part, blink: number): void {
    const white = byName.get(part.name.replace("lash-upper", "eye-white"));
    const { dx, dy } = parallax(part.name);
    const cy = part.y + part.h * 0.5;
    const target = white ? white.y + white.h * 0.72 : cy;
    c.save();
    c.translate(part.x + part.w / 2 + dx, cy + dy + blink * (target - cy));
    // Flips into a downward arc when closed, which reads as a shut eye.
    c.scale(1, Math.max(-0.45, 1 - 1.45 * blink));
    c.drawImage(part.img, -part.w / 2, -part.h / 2);
    c.restore();
  }

  function mouthOpen(): number {
    return clamp01((w.aa ?? 0) + (w.ou ?? 0) * 0.6 + (w.ih ?? 0) * 0.25);
  }
  const LOWER_DROP = 28;
  const UPPER_LIFT = 4;

  function drawMouthInside(c: CanvasRenderingContext2D, inside: Part): void {
    const open = mouthOpen();
    if (open < 0.02) return;
    const ou = w.ou ?? 0;
    const top = byName.get("teeth-top");
    const bottom = byName.get("teeth-bottom");
    const o = off(inside.w, inside.h);
    // Inside of the mouth, scaled open from its centre line.
    o.save();
    o.translate(inside.w / 2, inside.h / 2);
    o.scale(1 - 0.35 * ou, open);
    o.drawImage(inside.img, -inside.w / 2, -inside.h / 2);
    o.restore();
    o.globalCompositeOperation = "source-atop";
    const shift = ((LOWER_DROP - UPPER_LIFT) / 2) * open;
    if (top) o.drawImage(top.img, top.x - inside.x, top.y - inside.y - UPPER_LIFT * open - shift);
    if (bottom) o.drawImage(bottom.img, bottom.x - inside.x, bottom.y - inside.y + LOWER_DROP * open * 0.6 - shift);
    o.globalCompositeOperation = "source-over";

    const { dx, dy } = parallax(inside.name);
    c.drawImage(scratch, inside.x + dx, inside.y + dy + shift);
  }

  function drawLip(c: CanvasRenderingContext2D, part: Part): void {
    const open = mouthOpen();
    const ou = w.ou ?? 0;
    const happy = w.happy ?? 0;
    const { dx, dy } = parallax(part.name);
    const lift = part.name === "lip-upper" ? -UPPER_LIFT * open : LOWER_DROP * open;
    c.save();
    c.translate(part.x + part.w / 2 + dx, part.y + dy + lift - happy * 3);
    c.scale(1 - 0.22 * ou + 0.07 * happy, 1);
    c.drawImage(part.img, -part.w / 2, 0);
    c.restore();
  }

  return {
    mount(el) {
      canvas = el;
      ctx = el.getContext("2d");
    },

    async load(base) {
      const manifest: Manifest = await (await fetch(`${base}/parts.json`)).json();
      parts = await Promise.all(
        manifest.parts.map(
          (info) =>
            new Promise<Part>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve({ ...info, img });
              img.onerror = () => reject(new Error(`could not load ${info.name}`));
              img.src = `${base}/${info.name}.webp`;
            }),
        ),
      );
      byName.clear();
      for (const p of parts) byName.set(p.name, p);
    },

    applyPose(pose) {
      yaw = pose.neckEuler.y + pose.headEuler.y;
      pitch = pose.neckEuler.x + pose.headEuler.x;
      // Canvas rotation runs clockwise; the pose's roll runs counter-clockwise.
      roll = -(pose.neckEuler.z + pose.headEuler.z);
      w = pose.expressionWeights;
    },

    render(dt) {
      if (!canvas || !ctx || parts.length === 0) return;
      t += dt;

      // Hair trails behind head tilts on a soft spring.
      hairVel += (roll - hairLag) * 60 * dt - hairVel * 9 * dt;
      hairLag += hairVel * dt;
      const hairSwing = (hairLag - roll) * 0.8;

      // Idle blink when nothing else is blinking.
      let idleBlink = 0;
      if (autoBlink) {
        if (blinkT < 0 && t >= nextBlinkAt) blinkT = 0;
        if (blinkT >= 0) {
          blinkT += dt;
          const d = 0.16;
          idleBlink = blinkT < d ? blinkT / d : blinkT < 2 * d ? 2 - blinkT / d : 0;
          if (blinkT >= 2 * d) {
            blinkT = -1;
            nextBlinkAt = t + 2.5 + Math.random() * 3;
          }
        }
      }
      // The puppet's left eye is on the viewer's right; the mapping mirrors the
      // camera, so blinkLeft drives the eye on the viewer's left.
      const blinkL = clamp01(Math.max(w.blinkLeft ?? 0, w.blink ?? 0, idleBlink));
      const blinkR = clamp01(Math.max(w.blinkRight ?? 0, w.blink ?? 0, idleBlink));
      const breathe = Math.sin((t * Math.PI * 2) / 4.2);

      const c = ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      const s = Math.min(canvas.width / VIEW.w, canvas.height / VIEW.h);
      c.setTransform(s, 0, 0, s, (canvas.width - VIEW.w * s) / 2 - VIEW.x * s, (canvas.height - VIEW.h * s) / 2 - VIEW.y * s);
      c.imageSmoothingQuality = "high";

      for (const part of parts) {
        if (part.unfinished && !showUnfinished) continue;
        if (COMPOSITED.has(part.name)) continue;
        c.save();
        if (BODY.has(part.name)) {
          // Breathing: a slight rise of the shoulders, plus a little follow-through from the head.
          c.translate(NECK.x, 2000);
          c.scale(1, 1 + breathe * 0.004);
          c.translate(-NECK.x, -2000);
          c.translate(yaw * 0.06 * K_YAW, 0);
        } else {
          c.translate(0, -breathe * 3);
          c.translate(NECK.x, NECK.y);
          c.rotate(roll);
          c.translate(-NECK.x, -NECK.y);
          if (HAIR.has(part.name)) {
            c.translate(HEAD_TOP.x, HEAD_TOP.y);
            c.rotate(hairSwing * (part.name === "hair-back" ? 0.6 : 0.35));
            c.translate(-HEAD_TOP.x, -HEAD_TOP.y);
          }
        }

        if (part.name === "eye-white-l") drawEye(c, "l", blinkL);
        else if (part.name === "eye-white-r") drawEye(c, "r", blinkR);
        else if (part.name === "lash-upper-l") drawUpperLash(c, part, blinkL);
        else if (part.name === "lash-upper-r") drawUpperLash(c, part, blinkR);
        else if (part.name === "mouth-inside") drawMouthInside(c, part);
        else if (part.name === "lip-upper" || part.name === "lip-lower") drawLip(c, part);
        else {
          const { dx, dy } = parallax(part.name);
          const brow = part.name.startsWith("brow") ? -(w.surprised ?? 0) * 16 + Math.max(blinkL, blinkR) * 2 : 0;
          c.drawImage(part.img, part.x + dx, part.y + dy + brow);
        }
        c.restore();
      }
    },

    resize(cssW, cssH) {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    },

    setShowUnfinished(show) {
      showUnfinished = show;
    },
    setAutoBlink(on) {
      autoBlink = on;
    },
    dispose() {
      parts = [];
      byName.clear();
      canvas = null;
      ctx = null;
    },
  };
}
