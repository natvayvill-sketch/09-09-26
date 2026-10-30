import { describe, it, expect } from "vitest";
import { PIECES, pieceUrl } from "./pieces";

describe("pieces", () => {
  it("builds the strip path from the piece id", () => {
    expect(pieceUrl("star")).toBe("/mood/star.png");
  });

  it("every piece has a correctly named, correctly sized strip", async () => {
    // @types/node isn't installed, so load node:fs untyped.
    const fsModule: string = "node:fs";
    const fs = (await import(/* @vite-ignore */ fsModule)) as {
      readdirSync(path: string): string[];
      readFileSync(path: string): Uint8Array;
    };
    const dir = "public/mood";
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      // missing folder: every strip below is reported missing
    }
    const problems: string[] = [];
    for (const def of Object.values(PIECES)) {
      // Exact-name match: macOS ignores case, but most web hosts don't.
      const name = `${def.id}.png`;
      if (!files.includes(name)) {
        problems.push(`${dir}/${name} is missing`);
        continue;
      }
      const png = fs.readFileSync(`${dir}/${name}`);
      const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
      const width = header.getUint32(16);
      const height = header.getUint32(20);
      if (height !== def.frameSize || width % def.frameSize !== 0) {
        problems.push(`${dir}/${name} is ${width}x${height}, not a strip of ${def.frameSize}px frames`);
      }
    }
    expect(problems).toEqual([]);
  });
});
