// Generates placeholder pixel-art strips for the Living Portrait mood effects.
// Usage: node scripts/make-placeholder-mood.mjs
// Writes public/mood/<piece>.png. Replace them with real art using the same file
// names: one horizontal strip of square frames, frame size = image height.
import { mkdirSync, writeFileSync } from "node:fs";
import { strip } from "./png.mjs";

const INK = [58, 47, 40]; // --color-ink
const GOLD = [255, 214, 102];
const GOLD_DARK = [214, 150, 40];
const CLOUD = [236, 238, 244];
const CLOUD_EDGE = [168, 176, 192];
const RAIN = [96, 140, 210];
const ALERT = [214, 64, 52];

function disc(put, cx, cy, r, rgba) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(x, y, rgba);
    }
  }
}

/** Draws a list of strings as pixels: "#" = ink, "o" = fill. */
function pixels(put, rows, fill, dx = 0, dy = 0) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "#") put(x + dx, y + dy, INK);
      else if (ch === "o") put(x + dx, y + dy, fill);
    });
  });
}

// Warm glow in stepped, dithered rings: the outer ring is a checkerboard.
function light(put, f) {
  const c = 32;
  const grow = f; // frame 2 breathes out a pixel
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) - grow;
      if (d < 12) put(x, y, [...GOLD, 150]);
      else if (d < 20) put(x, y, [...GOLD, 95]);
      else if (d < 27) put(x, y, [...GOLD, 50]);
      else if (d < 31 && (x + y) % 2 === 0) put(x, y, [...GOLD, 40]);
    }
  }
}

const STAR_FRAMES = [
  [
    "................",
    "................",
    "................",
    "................",
    "......####......",
    ".....#oooo#.....",
    "....#oooooo#....",
    "....#oooooo#....",
    "....#oooooo#....",
    "....#oooooo#....",
    ".....#oooo#.....",
    "......####......",
  ],
  [
    "................",
    "................",
    ".......##.......",
    "......#oo#......",
    "......#oo#......",
    "..#####oo#####..",
    "..#oooooooooo#..",
    "...#oooooooo#...",
    "....#oooooo#....",
    "....#oo##oo#....",
    "...#oo#..#oo#...",
    "...###....###...",
  ],
  [
    ".......##.......",
    "......#oo#......",
    "......#oo#......",
    ".....#oooo#.....",
    "######oooo######",
    "#oooooooooooooo#",
    ".#oooooooooooo#.",
    "..#oooooooooo#..",
    "...#oooooooo#...",
    "...#ooo##ooo#...",
    "..#ooo#..#ooo#..",
    "..#oo#....#oo#..",
    "..###......###..",
  ],
  null, // filled in below: frame 1 again, so the twinkle goes small-big-bigger-big
];
STAR_FRAMES[3] = STAR_FRAMES[1];

function star(put, f) {
  pixels(put, STAR_FRAMES[f], GOLD, 0, 1);
  // a little sparkle highlight on the biggest frame
  if (f === 2) put(7, 7, [255, 250, 220]);
}

function cloud(put, f) {
  const puffs = [
    [14, 30, 9],
    [24, 24, 12],
    [35, 29, 9],
    [f ? 30 : 19, 33, 8],
  ];
  for (const [x, y, r] of puffs) disc(put, x, y, r + 1, CLOUD_EDGE);
  for (let y = 31; y <= 41; y++) for (let x = 13; x <= 35; x++) put(x, y, CLOUD_EDGE); // flat base
  for (const [x, y, r] of puffs) disc(put, x, y, r, CLOUD);
  for (let y = 31; y <= 40; y++) for (let x = 14; x <= 34; x++) put(x, y, CLOUD);
}

function drop(put) {
  pixels(
    put,
    ["...#....", "..#o#...", "..#o#...", ".#ooo#..", ".#ooo#..", ".#ooo#..", "..###..."],
    RAIN,
    0,
    0,
  );
}

const EXCLAIM = [
  "......####......",
  ".....#oooo#.....",
  ".....#oooo#.....",
  ".....#oooo#.....",
  ".....#oooo#.....",
  "......#oo#......",
  "......#oo#......",
  "......#oo#......",
  ".......##.......",
  "................",
  "......####......",
  ".....#oooo#.....",
  ".....#oooo#.....",
  "......####......",
];

const QUESTION = [
  ".....######.....",
  "....#oooooo#....",
  "...#oo####oo#...",
  "...####...#oo#..",
  "..........#oo#..",
  "........##oo#...",
  ".......#ooo#....",
  "......#oo##.....",
  "......#oo#......",
  ".......##.......",
  "......####......",
  ".....#oooo#.....",
  ".....#oooo#.....",
  "......####......",
];

// Two-frame wobble: the second frame leans a pixel.
const wobble = (rows) => (put, f) => pixels(put, rows, ALERT, f ? 1 : 0, 1);

const PIECES = {
  light: [64, 2, light],
  star: [16, 4, star],
  cloud: [48, 2, cloud],
  drop: [8, 1, drop],
  exclaim: [16, 2, wobble(EXCLAIM)],
  question: [16, 2, wobble(QUESTION)],
};

mkdirSync("public/mood", { recursive: true });
for (const [id, [size, frames, draw]] of Object.entries(PIECES)) {
  writeFileSync(`public/mood/${id}.png`, strip(size, frames, draw));
}
console.log("wrote public/mood");
