import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { PoseUpdate, QualityTier } from "./types";

export interface VrmScene {
  mount(canvas: HTMLCanvasElement, width: number, height: number): void;
  loadAvatar(url: string): Promise<void>;
  applyPose(pose: PoseUpdate): void;
  render(deltaSeconds: number): void;
  setQuality(tier: QualityTier): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createVrmScene(): VrmScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9dcc2"); // soft paper-adjacent tint

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 1.35, 1.1);
  camera.lookAt(0, 1.35, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5c, 1.4);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(1, 2, 1.5);
  scene.add(dir);

  let renderer: THREE.WebGLRenderer | null = null;
  let vrm: VRM | null = null;
  let currentTier: QualityTier = "strong";

  function applyTier(): void {
    if (!renderer) return;
    const ratio = currentTier === "strong" ? Math.min(window.devicePixelRatio, 2) : 1;
    renderer.setPixelRatio(ratio);
    // No shadows: nothing in the scene casts or receives them, so enabling
    // shadowMap would only buy an empty shadow pass every frame.
    dir.intensity = currentTier === "strong" ? 1.1 : 0.9;
  }

  function setBone(name: "neck" | "head", e: { x: number; y: number; z: number }): void {
    const node = vrm?.humanoid?.getNormalizedBoneNode(name);
    if (node) node.rotation.set(e.x, e.y, e.z);
  }

  return {
    mount(canvas, width, height) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyTier();
    },

    async loadAvatar(url) {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const loaded = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(loaded); // no-op for VRM 1.0; faces the camera for VRM 0.x
      if (vrm) scene.remove(vrm.scene);
      vrm = loaded;
      scene.add(vrm.scene);

      // Surface missing expression presets: a rig without them silently
      // no-ops those cues (setValue ignores unknown names).
      const MAPPED_EXPRESSIONS = [
        "blink", "blinkLeft", "blinkRight",
        "aa", "ih", "ou", "happy", "surprised",
      ];
      const em = vrm.expressionManager;
      const missing = MAPPED_EXPRESSIONS.filter((n) => !em || !em.getExpression(n));
      if (missing.length) {
        console.info(
          `[living-portrait] avatar is missing expression presets: ${missing.join(", ")} — ` +
            `those facial cues won't animate. A VRoid Studio export includes all of them.`,
        );
      }
    },

    applyPose(pose) {
      const em = vrm?.expressionManager;
      if (em) {
        for (const [name, weight] of Object.entries(pose.expressionWeights)) {
          try {
            em.setValue(name, weight);
          } catch {
            /* defensive: setValue currently no-ops on unknown names, but guard anyway */
          }
        }
      }
      setBone("neck", pose.neckEuler);
      setBone("head", pose.headEuler);
    },

    render(deltaSeconds) {
      vrm?.update(deltaSeconds);
      renderer?.render(scene, camera);
    },

    setQuality(tier) {
      currentTier = tier;
      applyTier();
    },

    resize(width, height) {
      renderer?.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    dispose() {
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrm = null;
      }
      renderer?.dispose();
      renderer = null;
    },
  };
}
