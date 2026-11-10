// Link-preview images (the picture shown when a page's link is pasted into
// Discord, LinkedIn, iMessage, etc.). Covers are drawn as tilted polaroids on
// the site's paper background. Built at `astro build` by src/pages/og/.
import sharp from 'sharp';
import { join } from 'node:path';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const PAPER = { r: 243, g: 234, b: 217 };
const POLAROID = '#f6efdf';

/** The site's paper background: the tile, washed with paper colour like global.css. */
async function background() {
  const tilePath = join('public', 'images/projects/background/background-tile.jpg');
  const { width: tw, height: th } = await sharp(tilePath).metadata();
  // The tile may be bigger than the card, so tile a canvas that fits whole tiles, then crop.
  const w = Math.ceil(OG_WIDTH / tw) * tw;
  const h = Math.ceil(OG_HEIGHT / th) * th;
  const tiled = await sharp({ create: { width: w, height: h, channels: 3, background: PAPER } })
    .composite([{ input: tilePath, tile: true, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const wash = await sharp({
    create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 4, background: { ...PAPER, alpha: 0.5 } },
  }).png().toBuffer();
  return sharp(tiled)
    .extract({ left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT })
    .composite([{ input: wash, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/** A cover inside a polaroid frame with a soft shadow, rotated, as a transparent PNG. */
async function polaroid(coverUrl, photoSize, degrees) {
  const pad = Math.round(photoSize * 0.04);
  const bottom = Math.round(photoSize * 0.14);
  const w = photoSize + pad * 2;
  const h = photoSize + pad + bottom;
  const blur = 14;
  const margin = blur * 3;

  const photo = await sharp(join('public', coverUrl))
    .resize(photoSize, photoSize, { fit: 'cover' })
    .flatten({ background: POLAROID })
    .toBuffer();
  const frame = await sharp({ create: { width: w, height: h, channels: 4, background: POLAROID } })
    .composite([{ input: photo, left: pad, top: pad }])
    .png()
    .toBuffer();
  const shadow = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.3 } },
  })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(blur)
    .png()
    .toBuffer();
  const withShadow = await sharp(shadow)
    .composite([{ input: frame, left: margin, top: margin - 6 }])
    .png()
    .toBuffer();
  return sharp(withShadow)
    .rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function centred(input, cx, cy) {
  const { width, height } = await sharp(input).metadata();
  return { input, left: Math.round(cx - width / 2), top: Math.round(cy - height / 2) };
}

/**
 * One preview image as a JPEG. One cover: a single polaroid in the middle.
 * Several (up to three): fanned out across the card.
 */
export async function previewImage(coverUrls) {
  const covers = coverUrls.slice(0, 3);
  const layouts = {
    1: [{ x: 0.5, y: 0.5, size: 470, deg: -3 }],
    2: [
      { x: 0.33, y: 0.5, size: 420, deg: -4 },
      { x: 0.67, y: 0.5, size: 420, deg: 3 },
    ],
    3: [
      { x: 0.24, y: 0.52, size: 380, deg: -6 },
      { x: 0.76, y: 0.52, size: 380, deg: 5 },
      { x: 0.5, y: 0.48, size: 400, deg: -1 },
    ],
  };
  // Polaroids may hang off the card's edges, which composite() won't allow,
  // so lay them out on an oversized transparent canvas and crop to the card.
  const bleed = 300;
  const layers = [];
  for (const [i, spot] of layouts[covers.length].entries()) {
    const card = await polaroid(covers[i], spot.size, spot.deg);
    layers.push(await centred(card, bleed + spot.x * OG_WIDTH, bleed + spot.y * OG_HEIGHT));
  }
  const arranged = await sharp({
    create: {
      width: OG_WIDTH + bleed * 2,
      height: OG_HEIGHT + bleed * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
  const cropped = await sharp(arranged)
    .extract({ left: bleed, top: bleed, width: OG_WIDTH, height: OG_HEIGHT })
    .png()
    .toBuffer();
  return sharp(await background())
    .composite([{ input: cropped, left: 0, top: 0 }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
