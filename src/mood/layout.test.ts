import { describe, it, expect } from "vitest";
import { alertSpots, cloudX, starArc } from "./layout";

const head = { x: 0.5, y: 0.45, size: 0.4, roll: 0 };

describe("starArc", () => {
  it("the first star sits straight above the head", () => {
    const [first] = starArc(head, 7);
    expect(first!.x).toBeCloseTo(0.5);
    expect(first!.y).toBeCloseTo(0.45 - 0.34);
  });

  it("stars come in mirrored pairs", () => {
    const spots = starArc(head, 7);
    expect(spots).toHaveLength(7);
    expect(spots[1]!.x - 0.5).toBeCloseTo(0.5 - spots[2]!.x);
    expect(spots[1]!.y).toBeCloseTo(spots[2]!.y);
  });

  it("the arc follows a head tilt", () => {
    expect(starArc({ ...head, roll: 0.2 }, 7)[0]!.x).toBeGreaterThan(0.5);
  });
});

describe("alertSpots", () => {
  it("alone, ! is centred; together, ! is left and ? is right", () => {
    const y = 0.45 - 0.4 * 0.75;
    expect(alertSpots(head, true, false)).toEqual({ exclaim: { x: 0.5, y } });
    expect(alertSpots(head, false, true)).toEqual({ question: { x: 0.5, y } });
    const both = alertSpots(head, true, true);
    expect(both.exclaim!.x).toBeCloseTo(0.5 - 0.07);
    expect(both.question!.x).toBeCloseTo(0.5 + 0.07);
    expect(alertSpots(head, false, false)).toEqual({});
  });
});

describe("cloudX", () => {
  it("clouds start fully outside the frame and come in towards the head", () => {
    expect(cloudX(0, "left", head, 0.3, 0.05)).toBeCloseTo(-0.2);
    expect(cloudX(1, "left", head, 0.3, 0.05)).toBeCloseTo(0.26);
    expect(cloudX(0, "right", head, 0.3, 0.05)).toBeCloseTo(1.2);
    expect(cloudX(1, "right", head, 0.3, 0.05)).toBeCloseTo(0.74);
  });
});
