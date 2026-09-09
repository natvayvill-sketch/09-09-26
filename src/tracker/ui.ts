import type { TrackerState } from "./types";

interface Handlers {
  onStart: () => void;
  onStop: () => void;
  onKeepGoing: () => void;
}

const COPY: Record<TrackerState["name"], { title: string; body: string; button?: string }> = {
  intro: {
    title: "The Living Portrait",
    body:
      "This turns your webcam into a puppet. Everything runs on your device — no video is sent anywhere, and nothing is recorded.",
    button: "Start camera",
  },
  requesting: { title: "One moment", body: "Waiting for camera permission…" },
  denied: {
    title: "No camera access",
    body:
      "On a computer, click the camera icon in your browser's address bar to allow access, then try again.",
    button: "Try again",
  },
  loading: { title: "Waking up the puppet", body: "Loading the model — this happens once." },
  running: { title: "", body: "", button: "Stop" },
  struggling: {
    title: "Running slowly",
    body: "This works best on a computer.",
    button: "Keep going anyway",
  },
  paused: {
    title: "Paused",
    body: "You switched away, so the camera was released.",
    button: "Start again",
  },
  stopped: { title: "Camera off", body: "Thanks for trying it.", button: "Start again" },
  error: {
    title: "Something went wrong",
    body: "The model failed to load. Check your connection and try again.",
    button: "Try again",
  },
  unsupported: { title: "Not supported here", body: "" },
};

export function renderState(root: HTMLElement, state: TrackerState, handlers: Handlers): void {
  const c = COPY[state.name];
  root.innerHTML = "";

  if (state.name === "running") {
    const stop = button("Stop", "lp-btn");
    stop.addEventListener("click", handlers.onStop);
    root.appendChild(stop);
    return;
  }

  const panel = document.createElement("div");
  panel.className = "lp-panel";

  if (c.title) {
    const h = document.createElement("p");
    h.className = "lp-panel-title";
    h.textContent = c.title;
    panel.appendChild(h);
  }

  let bodyText = c.body;
  if (state.name === "unsupported") {
    bodyText =
      state.unsupportedReason === "no-webgl2"
        ? "Your browser can't run the 3D view. Try a recent Chrome, Edge, Firefox, or Safari."
        : "This runs best on a computer. You can still try it below.";
  }
  if (bodyText) {
    const p = document.createElement("p");
    p.textContent = bodyText;
    panel.appendChild(p);
  }

  const isNoWebgl2 = state.name === "unsupported" && state.unsupportedReason === "no-webgl2";
  const btnLabel =
    state.name === "unsupported" && state.unsupportedReason === "weak-device"
      ? "Try anyway"
      : c.button;

  if (btnLabel && !isNoWebgl2) {
    const b = button(btnLabel, "lp-btn");
    b.addEventListener("click", () => {
      if (state.name === "struggling") handlers.onKeepGoing();
      else handlers.onStart();
    });
    panel.appendChild(b);
  }

  root.appendChild(panel);
}

function button(label: string, className: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  return b;
}
