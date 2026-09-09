import type { TrackerState, TrackerEvent, TrackerEffect, MappingState } from "./types";
import { INITIAL_STATE, reduce } from "./stateMachine";
import { createMappingState, mapFaceToPose, DEFAULT_MAPPING_CONFIG } from "./mapping";
import { readDeviceSignals, hasWebGL2, pickTier, FrameRateWatchdog } from "./degradation";
import { requestCamera, stopCamera } from "./camera";
import { renderState } from "./ui";
import type { FaceTracker } from "./faceTracker";
import type { VrmScene } from "./vrmScene";

interface StartOpts {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  modelUrl: string;
  wasmBase: string;
  avatarUrl: string;
}

export function start(opts: StartOpts): void {
  let state: TrackerState = INITIAL_STATE;
  let stream: MediaStream | null = null;
  let faceTracker: FaceTracker | null = null;
  let scene: VrmScene | null = null;
  let mapState: MappingState = createMappingState();
  let rafId = 0;
  let lastTs = 0;
  let fpsEma = 60;
  let lastRaw: import("./types").RawFaceInput | null = null;
  let lastDetectTs = 0;

  const tier = pickTier(readDeviceSignals());
  // Detection runs at the tier's target rate, not the display rate; the
  // mapping smoothing interpolates the avatar between tracking updates.
  const detectIntervalMs = tier === "strong" ? 1000 / 30 : 1000 / 20;
  const watchdog = new FrameRateWatchdog(
    { fpsFloor: 12, sustainedMs: 5000 },
    () => dispatch({ type: "FPS_LOW" }),
  );

  function draw(): void {
    renderState(opts.root, state, {
      onStart: () => dispatch({ type: "START" }),
      onStop: () => dispatch({ type: "STOP" }),
      onKeepGoing: () => dispatch({ type: "KEEP_GOING" }),
    });
  }

  function dispatch(event: TrackerEvent): void {
    const { state: next, effects } = reduce(state, event);
    state = next;
    draw();
    for (const eff of effects) void runEffect(eff);
  }

  async function runEffect(effect: TrackerEffect): Promise<void> {
    switch (effect) {
      case "request-camera": {
        const result = await requestCamera();
        if (state.name !== "requesting") {
          // tab was hidden / stopped while the permission prompt was open
          if (result.ok) stopCamera(result.stream);
          return;
        }
        if (result.ok) {
          stream = result.stream;
          opts.video.srcObject = stream;
          await opts.video.play().catch(() => undefined);
          dispatch({ type: "PERMISSION_GRANTED" });
        } else {
          dispatch({ type: "PERMISSION_DENIED" });
        }
        return;
      }
      case "load-models": {
        try {
          if (!faceTracker) {
            const { createFaceTracker } = await import("./faceTracker");
            try {
              faceTracker = await createFaceTracker({
                wasmBase: opts.wasmBase,
                modelUrl: opts.modelUrl,
                delegate: "GPU",
              });
            } catch (gpuErr) {
              console.warn("[living-portrait] GPU delegate failed, retrying on CPU", gpuErr);
              faceTracker = await createFaceTracker({
                wasmBase: opts.wasmBase,
                modelUrl: opts.modelUrl,
                delegate: "CPU",
              });
            }
          }
          if (!scene) {
            const { createVrmScene } = await import("./vrmScene");
            scene = createVrmScene();
            const rect = opts.canvas.getBoundingClientRect();
            scene.mount(opts.canvas, rect.width || 480, rect.height || 480);
            scene.setQuality(tier);
            await scene.loadAvatar(opts.avatarUrl);
          }
          dispatch({ type: "LOAD_OK" });
        } catch (err) {
          console.error("[living-portrait] load failed", err);
          // a scene that failed mid-load must not be reused: a retry would
          // skip the `if (!scene)` block and render an avatar-less scene.
          if (scene) {
            scene.dispose();
            scene = null;
          }
          dispatch({ type: "LOAD_FAILED" });
        }
        return;
      }
      case "start-loop": {
        watchdog.reset();
        mapState = createMappingState();
        lastRaw = null;
        lastDetectTs = 0;
        fpsEma = 60;
        lastTs = performance.now();
        const loop = (now: number): void => {
          rafId = requestAnimationFrame(loop);
          const dt = Math.min((now - lastTs) / 1000, 0.1);
          lastTs = now;
          if (dt > 0) fpsEma = fpsEma * 0.9 + (1 / dt) * 0.1;
          watchdog.sample(fpsEma, now);

          if (faceTracker && scene && opts.video.readyState >= 2) {
            if (now - lastDetectTs >= detectIntervalMs) {
              lastRaw = faceTracker.detect(opts.video, now);
              lastDetectTs = now;
            }
            if (lastRaw) {
              const mapped = mapFaceToPose(lastRaw, mapState, DEFAULT_MAPPING_CONFIG);
              mapState = mapped.state;
              scene.applyPose(mapped.pose);
            }
          }
          scene?.render(dt);
        };
        rafId = requestAnimationFrame(loop);
        return;
      }
      case "stop-loop": {
        cancelAnimationFrame(rafId);
        rafId = 0;
        return;
      }
      case "release-camera": {
        if (stream) {
          stopCamera(stream);
          stream = null;
        }
        opts.video.srcObject = null;
        return;
      }
    }
  }

  if (!hasWebGL2()) {
    dispatch({ type: "UNSUPPORTED", reason: "no-webgl2" });
  } else if (tier === "weak" && readDeviceSignals().maxViewportPx < 700) {
    dispatch({ type: "UNSUPPORTED", reason: "weak-device" });
  } else {
    draw();
  }

  // No teardown: this site is a plain multi-page app, so navigating away is a
  // full document unload that drops these listeners and the whole tracker.
  // If a client-side router (Astro ClientRouter / View Transitions) is ever
  // added, start() will need to return a cleanup function.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") dispatch({ type: "HIDDEN" });
  });

  window.addEventListener("resize", () => {
    if (!scene) return;
    const rect = opts.canvas.getBoundingClientRect();
    scene.resize(rect.width || 480, rect.height || 480);
  });
}
