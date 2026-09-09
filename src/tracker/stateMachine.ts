import type { TrackerState, TrackerEvent, TrackerEffect } from "./types";

export const INITIAL_STATE: TrackerState = {
  name: "intro",
  suppressStruggling: false,
};

type Result = { state: TrackerState; effects: TrackerEffect[] };

const stop = (): Result => ({
  state: { name: "stopped", suppressStruggling: false },
  effects: ["stop-loop", "release-camera"],
});

const pause = (): Result => ({
  state: { name: "paused", suppressStruggling: false },
  effects: ["stop-loop", "release-camera"],
});

const request = (s: TrackerState): Result => ({
  state: { ...s, name: "requesting" },
  effects: ["request-camera"],
});

export function reduce(state: TrackerState, event: TrackerEvent): Result {
  const noop: Result = { state, effects: [] };

  switch (event.type) {
    case "UNSUPPORTED":
      return {
        state: { ...state, name: "unsupported", unsupportedReason: event.reason },
        effects: [],
      };

    case "START":
      if (["intro", "denied", "error", "paused", "stopped", "unsupported"].includes(state.name)) {
        return request(state);
      }
      return noop;

    case "PERMISSION_GRANTED":
      if (state.name === "requesting") {
        return { state: { ...state, name: "loading" }, effects: ["load-models"] };
      }
      return noop;

    case "PERMISSION_DENIED":
      if (state.name === "requesting") {
        return { state: { ...state, name: "denied" }, effects: [] };
      }
      return noop;

    case "LOAD_OK":
      if (state.name === "loading") {
        return { state: { ...state, name: "running" }, effects: ["start-loop"] };
      }
      return noop;

    case "LOAD_FAILED":
      if (state.name === "loading") {
        return { state: { ...state, name: "error" }, effects: [] };
      }
      return noop;

    case "FPS_LOW":
      if (state.name === "running" && !state.suppressStruggling) {
        return { state: { ...state, name: "struggling" }, effects: [] };
      }
      return noop;

    case "KEEP_GOING":
      if (state.name === "struggling") {
        return {
          state: { ...state, name: "running", suppressStruggling: true },
          effects: [],
        };
      }
      return noop;

    case "STOP":
      if (["running", "struggling", "paused"].includes(state.name)) {
        return stop();
      }
      return noop;

    case "HIDDEN":
      if (
        state.name === "running" ||
        state.name === "struggling" ||
        state.name === "requesting" ||
        state.name === "loading"
      ) {
        return pause();
      }
      return noop;

    default:
      return noop;
  }
}
