// three.js GLTF viewer for the Studio 3D pane. The optimize pipeline
// (packages/assetgen/src/model3d.ts) always Draco-compresses geometry and may
// KTX2-encode textures, so the GLTFLoader is wired with BOTH a DRACOLoader and a
// KTX2Loader; three only invokes each when the GLB declares the matching
// extension. Decoder assets resolve from `./decoders/` (vite.config.ts bundles
// them; model-preview-config.ts owns the paths).
//
// This component is mounted under a `key={src}` by ModelPreview, so each new
// model arrives on a fresh instance: `loading`/`error` start clean from their
// initial useState and the effect never resynchronises state to a changed prop.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { decoderPaths } from "./model-preview-config";

export interface ModelViewerProps {
  /** Data URL (or any URL) of the optimized GLB to render. */
  src: string;
  /** Accessible label for the canvas. */
  label?: string;
}

// Drop a loaded scene's GPU resources so re-generating doesn't leak.
function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      mat.dispose();
    }
  });
}

// Mutually-exclusive load phases as a single state, so each transition is one
// setState (no cascading setError + setLoading pair on the error path).
type Status = { phase: "loading" } | { phase: "ready" } | { phase: "error"; message: string };

export function ModelViewer({ src, label = "3D model preview" }: ModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ phase: "loading" });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let raf = 0;
    let disposed = false;
    const width = mount.clientWidth || 480;
    const height = mount.clientHeight || 360;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 1, 3);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(3, 5, 4);
    scene.add(key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;

    const paths = decoderPaths();
    const dracoLoader = new DRACOLoader().setDecoderPath(paths.draco);
    const ktx2Loader = new KTX2Loader().setTranscoderPath(paths.ktx2).detectSupport(renderer);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setKTX2Loader(ktx2Loader);

    let mixer: THREE.AnimationMixer | null = null;
    let loaded: THREE.Object3D | null = null;
    const clock = new THREE.Clock();

    // Pull the camera back to frame the whole model regardless of its export scale.
    function frame(object: THREE.Object3D): void {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const dist = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(center.x, center.y + maxDim * 0.25, center.z + dist * 1.8);
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    }

    loader.load(
      src,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        loaded = gltf.scene;
        scene.add(loaded);
        frame(loaded);
        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(loaded);
          mixer.clipAction(gltf.animations[0]!).play();
        }
        setStatus({ phase: "ready" });
      },
      undefined,
      (err) => {
        if (disposed) return;
        setStatus({ phase: "error", message: err instanceof Error ? err.message : "failed to load model" });
      },
    );

    function tick(): void {
      raf = requestAnimationFrame(tick);
      mixer?.update(clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
    }
    tick();

    const resize = new ResizeObserver(() => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resize.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      dracoLoader.dispose();
      ktx2Loader.dispose();
      mixer?.stopAllAction();
      if (loaded) {
        scene.remove(loaded);
        disposeObject(loaded);
      }
      // forceContextLoss before dispose so the underlying WebGL context is
      // released now, not when the GC eventually collects it. Browsers cap live
      // contexts (~16); without this, re-generating models repeatedly leaks them
      // and eventually drops the oldest canvas to a blank "context lost".
      renderer.forceContextLoss();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [src]);

  return (
    <div className="model-stage" aria-label={label}>
      <div ref={mountRef} className="model-canvas" />
      {status.phase === "loading" && <div className="model-status">decoding…</div>}
      {status.phase === "error" && <div className="model-status is-err">preview failed: {status.message}</div>}
    </div>
  );
}
