// Make web-sized WebP copies of project art.
//
//   node scripts/optimize-images.mjs public/images/projects/<project>/<file>.png [...more]
//
// Each input gets a .webp next to it, at most MAX_EDGE px on its longest side
// (panels display at up to 512px wide, so this is ~3x for sharp retina screens).
// Transparency is kept. The input file is not changed or deleted: move your
// full-size original out of public/ yourself so it isn't deployed, then point
// the project's markdown at the .webp.
import sharp from 'sharp';
import { statSync } from 'node:fs';

const MAX_EDGE = 1600;
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/optimize-images.mjs <image> [...more]');
  process.exit(1);
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

for (const input of files) {
  const output = input.replace(/\.(png|jpe?g)$/i, '.webp');
  if (output === input) {
    console.error(`skip ${input}: not a .png or .jpg`);
    continue;
  }
  const info = await sharp(input)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toFile(output);
  console.log(`${input} (${kb(statSync(input).size)}) -> ${output} ${info.width}x${info.height} (${kb(info.size)})`);
}
