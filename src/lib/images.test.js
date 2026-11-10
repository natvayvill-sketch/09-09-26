import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Big images make the site slow to load (bugs log #5). Run full-size art
// through scripts/optimize-images.mjs before adding it to public/.
const MAX_BYTES = 1024 * 1024;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe('site images', () => {
  it('keeps every image in public/images under 1 MB', () => {
    const tooBig = filesUnder('public/images')
      .filter((file) => /\.(png|jpe?g|webp|gif|avif)$/i.test(file))
      .map((file) => ({ file, mb: statSync(file).size / 1024 / 1024 }))
      .filter(({ mb }) => mb * 1024 * 1024 > MAX_BYTES)
      .map(({ file, mb }) => `${file} is ${mb.toFixed(1)} MB; run: node scripts/optimize-images.mjs ${file}`);
    expect(tooBig).toEqual([]);
  });

  it('only points projects at images that exist (exact name and case)', () => {
    const missing = [];
    for (const name of readdirSync('src/content/projects').filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join('src/content/projects', name), 'utf8');
      for (const [, url] of text.matchAll(/"(\/images\/[^"]+)"/g)) {
        const file = join('public', url);
        // existsSync ignores case on macOS, so also check the folder listing.
        const folder = file.slice(0, file.lastIndexOf('/'));
        const base = file.slice(file.lastIndexOf('/') + 1);
        if (!existsSync(folder) || !readdirSync(folder).includes(base)) {
          missing.push(`${name}: ${url}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
