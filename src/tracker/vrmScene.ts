import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { PoseUpdate, QualityTier } from "./types";
import type { HeadAnchor } from "../mood/types";

export interface VrmScene {
  mount(canvas: HTMLCanvasElement, width: number, height: number): void;
  loadAvatar(url: string): Promise<void>;
  applyPose(pose: PoseUpdate): void;
  render(deltaSeconds: number): void;
  setQuality(tier: QualityTier): void;
  resize(width: number, height: number): void;
  /** Where the head is on the stage, for the mood effects. null before the avatar loads. */
  headAnchor(): HeadAnchor | null;
  dispose(): void;
}

export function createVrmScene(): VrmScene {
  // No scene background: the canvas is see-through so the mood effects can sit
  // between the page's paper tint (.lp-stage) and the character.
  const scene = new THREE.Scene();

  // Framed with headroom above the head for the stars and the "!" / "?".
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 1.38, 1.35);
  camera.lookAt(0, 1.38, 0);

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
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
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

    headAnchor() {
      const head = vrm?.humanoid?.getNormalizedBoneNode("head");
      if (!head) return null;
      // The head bone sits at the base of the skull; its centre is a little higher.
      const base = head.getWorldPosition(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      const centre = base.clone().addScaledVector(up, 0.08);
      const top = centre.clone().addScaledVector(up, 0.125);
      const bottom = centre.clone().addScaledVector(up, -0.125);
      const toStage = (v: THREE.Vector3): { x: number; y: number } => {
        const ndc = v.clone().project(camera);
        return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 };
      };
      const c = toStage(centre);
      const t = toStage(top);
      const b = toStage(bottom);
      return {
        x: c.x,
        y: c.y,
        size: Math.hypot(t.x - b.x, t.y - b.y),
        // Screen-space tilt: positive when the top of the head leans right.
        roll: Math.atan2(t.x - b.x, b.y - t.y),
      };
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
