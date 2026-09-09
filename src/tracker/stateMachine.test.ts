import { describe, it, expect } from "vitest";
import { INITIAL_STATE, reduce } from "./stateMachine";
import type { TrackerState } from "./types";

const at = (name: TrackerState["name"], extra: Partial<TrackerState> = {}): TrackerState => ({
  name,
  suppressStruggling: false,
  ...extra,
});

describe("stateMachine.reduce", () => {
  it("intro + START -> requesting, requests the camera", () => {
    const r = reduce(INITIAL_STATE, { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("requesting + PERMISSION_GRANTED -> loading, loads models", () => {
    const r = reduce(at("requesting"), { type: "PERMISSION_GRANTED" });
    expect(r.state.name).toBe("loading");
    expect(r.effects).toContain("load-models");
  });

  it("requesting + PERMISSION_DENIED -> denied, no effects", () => {
    const r = reduce(at("requesting"), { type: "PERMISSION_DENIED" });
    expect(r.state.name).toBe("denied");
    expect(r.effects).toEqual([]);
  });

  it("denied + START -> requesting again", () => {
    const r = reduce(at("denied"), { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("loading + LOAD_OK -> running, starts the loop", () => {
    const r = reduce(at("loading"), { type: "LOAD_OK" });
    expect(r.state.name).toBe("running");
    expect(r.effects).toContain("start-loop");
  });

  it("loading + LOAD_FAILED -> error", () => {
    const r = reduce(at("loading"), { type: "LOAD_FAILED" });
    expect(r.state.name).toBe("error");
  });

  it("error + START -> requesting", () => {
    const r = reduce(at("error"), { type: "START" });
    expect(r.state.name).toBe("requesting");
  });

  it("running + FPS_LOW -> struggling (first time)", () => {
    const r = reduce(at("running"), { type: "FPS_LOW" });
    expect(r.state.name).toBe("struggling");
  });

  it("running + FPS_LOW stays running when struggling is suppressed", () => {
    const r = reduce(at("running", { suppressStruggling: true }), { type: "FPS_LOW" });
    expect(r.state.name).toBe("running");
  });

  it("struggling + KEEP_GOING -> running with suppressStruggling set", () => {
    const r = reduce(at("struggling"), { type: "KEEP_GOING" });
    expect(r.state.name).toBe("running");
    expect(r.state.suppressStruggling).toBe(true);
    expect(r.effects).toEqual([]);
  });

  it("running + STOP -> stopped, stops loop and releases camera", () => {
    const r = reduce(at("running"), { type: "STOP" });
    expect(r.state.name).toBe("stopped");
    expect(r.effects).toEqual(expect.arrayContaining(["stop-loop", "release-camera"]));
  });

  it("running + HIDDEN -> paused, stops loop and releases camera", () => {
    const r = reduce(at("running"), { type: "HIDDEN" });
    expect(r.state.name).toBe("paused");
    expect(r.effects).toEqual(expect.arrayContaining(["stop-loop", "release-camera"]));
  });

  it("paused + START -> requesting", () => {
    const r = reduce(at("paused"), { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("stopped resets suppressStruggling to false", () => {
    const r = reduce(at("struggling", { suppressStruggling: true }), { type: "STOP" });
    expect(r.state.suppressStruggling).toBe(false);
  });

  it("unsupported (weak-device) + START -> requesting (weak devices can still try)", () => {
    const r = reduce(at("unsupported", { unsupportedReason: "weak-device" }), { type: "START" });
    expect(r.state.name).toBe("requesting");
    expect(r.effects).toContain("request-camera");
  });

  it("intro + UNSUPPORTED -> unsupported with the reason", () => {
    const r = reduce(INITIAL_STATE, { type: "UNSUPPORTED", reason: "no-webgl2" });
    expect(r.state.name).toBe("unsupported");
    expect(r.state.unsupportedReason).toBe("no-webgl2");
  });

  it("ignores events with no transition (no-op, same state, no effects)", () => {
    const r = reduce(at("intro"), { type: "LOAD_OK" });
    expect(r.state.name).toBe("intro");
    expect(r.effects).toEqual([]);
  });
});
