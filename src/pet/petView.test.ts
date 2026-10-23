import { describe, it, expect } from "vitest";
import { petAfterRestore } from "./petView";

describe("petAfterRestore", () => {
  it("shows a pet whose swap was queued while the pet was dismissed", () => {
    expect(petAfterRestore("tan", "teal")).toBe("teal");
  });

  it("keeps the current pet when no swap is queued", () => {
    expect(petAfterRestore("tan", null)).toBe("tan");
  });
});
