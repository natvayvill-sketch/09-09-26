import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import type { RawFaceInput } from "./types";

export interface FaceTracker {
  detect(video: HTMLVideoElement, timestampMs: number): RawFaceInput;
  close(): void;
}

export async function createFaceTracker(opts: {
  wasmBase: string;
  modelUrl: string;
  delegate: "GPU" | "CPU";
}): Promise<FaceTracker> {
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmBase);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: opts.modelUrl, delegate: opts.delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  return {
    detect(video, timestampMs): RawFaceInput {
      const res = landmarker.detectForVideo(video, timestampMs);
      const categories = res.faceBlendshapes?.[0]?.categories ?? [];
      const blendshapes: Record<string, number> = {};
      for (const c of categories) {
        if (c.categoryName) blendshapes[c.categoryName] = c.score;
      }
      const matrix = res.facialTransformationMatrixes?.[0]?.data ?? null;
      return {
        blendshapes,
        headMatrix: matrix ? Array.from(matrix) : null,
        faceConfidence: categories.length > 0 ? 1 : 0,
      };
    },
    close() {
      landmarker.close();
    },
  };
}
