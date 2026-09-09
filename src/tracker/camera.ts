export type CameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "denied" | "no-device" | "error"; error: unknown };

export async function requestCamera(): Promise<CameraResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "no-device", error: new Error("getUserMedia unavailable") };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    return { ok: true, stream };
  } catch (error) {
    const name = (error as DOMException | undefined)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, reason: "denied", error };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return { ok: false, reason: "no-device", error };
    }
    return { ok: false, reason: "error", error };
  }
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
