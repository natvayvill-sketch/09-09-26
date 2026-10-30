import { start } from "./trackerApp";

// This module runs once, but with <ClientRouter /> the visitor can leave the
// page and come back without a reload, so mount and unmount on page changes.
let cleanup: (() => void) | null = null;

function mount(): void {
  if (cleanup) return;
  const root = document.getElementById("lp-ui");
  const canvas = document.getElementById("lp-canvas");
  const video = document.getElementById("lp-video");
  if (
    !root ||
    !(canvas instanceof HTMLCanvasElement) ||
    !(video instanceof HTMLVideoElement)
  ) {
    return;
  }
  cleanup = start({
    root,
    canvas,
    video,
    modelUrl: "/tracker/face_landmarker.task",
    wasmBase: "/tracker/wasm",
    avatarUrl: "/tracker/avatar.vrm",
  });
}

function unmount(): void {
  cleanup?.();
  cleanup = null;
}

document.addEventListener("astro:page-load", mount);
document.addEventListener("astro:before-swap", unmount);
mount();
