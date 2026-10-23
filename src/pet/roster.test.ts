import { describe, it, expect } from "vitest";
import {
  DEFAULT_PET_ID,
  ERA_PETS,
  PETS,
  choosePet,
  petForPage,
  settingsFor,
  spriteUrl,
  type PetDef,
} from "./roster";
import { DEFAULT_SETTINGS } from "./behavior";

const pet = (id: string): PetDef => ({ id, frameSize: 32, anims: ["idle", "walk"] });
const pets = { [DEFAULT_PET_ID]: pet(DEFAULT_PET_ID), cat: pet("cat"), owl: pet("owl") };
const eraPets = { "Age of Cats": "cat", "Age of Owls": "owl", "Broken Era": "missing" };

describe("choosePet", () => {
  it("uses the current era's pet first", () => {
    expect(choosePet("Age of Cats", "Age of Owls", eraPets, pets).id).toBe("cat");
  });

  it("uses the remembered era's pet on pages without an era", () => {
    expect(choosePet(null, "Age of Owls", eraPets, pets).id).toBe("owl");
  });

  it("uses the remembered era's pet when the current era has none", () => {
    expect(choosePet("Unknown Era", "Age of Owls", eraPets, pets).id).toBe("owl");
  });

  it("skips era entries that point at a pet that doesn't exist", () => {
    expect(choosePet("Broken Era", null, eraPets, pets).id).toBe(DEFAULT_PET_ID);
  });

  it("falls back to the default pet", () => {
    expect(choosePet(null, null, eraPets, pets).id).toBe(DEFAULT_PET_ID);
  });
});

describe("petForPage", () => {
  it("remembers an era that has a pet", () => {
    const r = petForPage("Age of Cats", "Age of Owls", eraPets, pets);
    expect(r.pet.id).toBe("cat");
    expect(r.remember).toBe("Age of Cats");
  });

  it("keeps the remembered pet on an era without one, and doesn't remember that era", () => {
    const r = petForPage("Unknown Era", "Age of Owls", eraPets, pets);
    expect(r.pet.id).toBe("owl");
    expect(r.remember).toBeNull();
  });

  it("doesn't remember an era whose roster entry points at a missing pet", () => {
    expect(petForPage("Broken Era", null, eraPets, pets).remember).toBeNull();
  });

  it("remembers nothing on pages without an era", () => {
    const r = petForPage(null, "Age of Owls", eraPets, pets);
    expect(r.pet.id).toBe("owl");
    expect(r.remember).toBeNull();
  });
});

describe("spriteUrl / settingsFor", () => {
  it("builds the strip path from the pet id and animation", () => {
    expect(spriteUrl(pet("cat"), "walk")).toBe("/pets/cat/walk.png");
  });

  it("merges a pet's setting overrides over the defaults", () => {
    const merged = settingsFor({ ...pet("cat"), settings: { walkSpeed: 99 } });
    expect(merged.walkSpeed).toBe(99);
    expect(merged.sitChance).toBe(DEFAULT_SETTINGS.sitChance);
  });
});

describe("the real roster", () => {
  it("includes the default pet", () => {
    expect(PETS[DEFAULT_PET_ID]).toBeDefined();
  });

  it("only maps eras to pets that exist", () => {
    for (const id of Object.values(ERA_PETS)) expect(PETS[id], id).toBeDefined();
  });

  it("keys every pet by its own id and gives it idle and walk", () => {
    for (const [key, def] of Object.entries(PETS)) {
      expect(def.id).toBe(key);
      expect(def.anims).toContain("idle");
      expect(def.anims).toContain("walk");
    }
  });

  it("has a correctly named, correctly sized PNG for every animation a pet lists", async () => {
    // @types/node isn't installed, so load node:fs untyped.
    const fsModule: string = "node:fs";
    const fs = (await import(/* @vite-ignore */ fsModule)) as {
      readdirSync(path: string): string[];
      readFileSync(path: string): Uint8Array;
    };
    const problems: string[] = [];
    for (const def of Object.values(PETS)) {
      const dir = `public/pets/${def.id}`;
      let files: string[] = [];
      try {
        files = fs.readdirSync(dir);
      } catch {
        // missing folder: every strip below is reported missing
      }
      for (const anim of def.anims) {
        // Exact-name match: macOS ignores case, but most web hosts don't.
        const name = `${anim}.png`;
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
    }
    expect(problems).toEqual([]);
  });
});
