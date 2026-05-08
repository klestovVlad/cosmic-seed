import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface SceneHandle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly composer: EffectComposer;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  // Camera is INSIDE the periodic box: edges of the wireframe go off-screen,
  // viewport shows the interior of the simulated volume. Without this the
  // box looks like a small object floating in space; with it, structure
  // fills the frame and the cube edges are just hints at the periphery.
  camera.position.set(0.7, 0.45, 1.05);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 20;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  // Gentle auto-orbit so the scene feels alive even when the user isn't
  // dragging. Disabled the moment user interacts; OrbitControls re-enables
  // it after `autoRotateDelay` ms of idle (which we keep at the default).
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45; // ≈ 1 rev / 90 s

  // Postprocessing chain: render → bloom → tone-map/sRGB output.
  // UnrealBloomPass with a high luminance threshold so only the bright cores
  // of the star sprites cross it — DM (violet, dark) and most gas (blue→
  // orange) stay unbloomed. Stars then read as actual luminous sources.
  // Threshold/strength/radius tuned empirically for the white star core
  // (rgb(1.0, 0.96, 0.85) × intensity, additive) to produce a soft halo
  // without smearing the cosmic-web background.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    /* strength */ 0.85,
    /* radius   */ 0.55,
    /* threshold*/ 0.78,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = (width: number, height: number, dpr: number): void => {
    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.setSize(width, height, false);
    composer.setPixelRatio(Math.min(dpr, 2));
    composer.setSize(width, height);
    bloom.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };

  const dispose = (): void => {
    controls.dispose();
    composer.dispose();
    renderer.dispose();
  };

  return { renderer, scene, camera, controls, composer, resize, dispose };
}
