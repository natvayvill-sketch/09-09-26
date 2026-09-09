import { start } from "./trackerApp";

const root = document.getElementById("lp-ui");
const canvas = document.getElementById("lp-canvas");
const video = document.getElementById("lp-video");

if (
  root &&
  canvas instanceof HTMLCanvasElement &&
  video instanceof HTMLVideoElement
) {
  start({
    root,
    canvas,
    video,
    modelUrl: "/tracker/face_landmarker.task",
    wasmBase: "/tracker/wasm",
    avatarUrl: "/tracker/avatar.vrm",
  });
}
