// Generates placeholder pet sprite strips so the pet code can run before the real art exists.
// Usage: node scripts/make-placeholder-pets.mjs
// Writes public/pets/<pet-id>/<anim>.png. Replace them with real art using the same file names.
import { mkdirSync, writeFileSync } from "node:fs";
import { strip as stripOf } from "./png.mjs";

const S = 32;
const INK = [58, 47, 40]; // --color-ink

/** frameCount 32×32 frames side by side. drawFrame(put, f) draws frame f. */
const strip = (frameCount, drawFrame) => stripOf(S, frameCount, drawFrame);

const PETS = {
  "living-portrait": [201, 150, 98],
  "placeholder-b": [47, 111, 106],
};

function ellipse(put, cx, cy, rx, ry, rgb) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, rgb);
    }
  }
}

function rect(put, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, rgb);
}

/** A round blob creature facing right. feet: [leftDy, rightDy], or null to hide them. */
function blob(put, color, { dy = 0, squash = 0, eyes = "open", feet = [0, 0] } = {}) {
  const cy = 19 + dy + squash;
  if (feet) {
    rect(put, 10, 27 + dy + feet[0], 4, 3, INK);
    rect(put, 18, 27 + dy + feet[1], 4, 3, INK);
  }
  ellipse(put, 16, cy, 11, 10 - squash, INK);
  ellipse(put, 16, cy, 10, 9 - squash, color);
  const ey = cy - 2;
  if (eyes === "closed") {
    rect(put, 12, ey + 1, 3, 1, INK);
    rect(put, 19, ey + 1, 3, 1, INK);
  } else if (eyes === "wide") {
    rect(put, 12, ey - 1, 3, 3, INK);
    rect(put, 19, ey - 1, 3, 3, INK);
  } else {
    rect(put, 13, ey, 2, 2, INK);
    rect(put, 20, ey, 2, 2, INK);
  }
}

const ANIMS = {
  idle: [2, (put, f, c) => blob(put, c, { dy: f })],
  walk: [4, (put, f, c) => blob(put, c, { dy: f % 2 ? -1 : 0, feet: [[0, -2], [0, 0], [-2, 0], [0, 0]][f] })],
  sit: [1, (put, f, c) => blob(put, c, { squash: 2, feet: null })],
  sleep: [2, (put, f, c) => blob(put, c, { squash: 2 + f, eyes: "closed", feet: null })],
  notice: [1, (put, f, c) => blob(put, c, { eyes: "wide" })],
  react: [4, (put, f, c) => blob(put, c, { dy: [0, -4, -6, -2][f], eyes: f ? "closed" : "open" })],
};

for (const [id, color] of Object.entries(PETS)) {
  const dir = `public/pets/${id}`;
  mkdirSync(dir, { recursive: true });
  for (const [anim, [frames, draw]] of Object.entries(ANIMS)) {
    writeFileSync(`${dir}/${anim}.png`, strip(frames, (put, f) => draw(put, f, color)));
  }
  console.log(`wrote ${dir}`);
}
