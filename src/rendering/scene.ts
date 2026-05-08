import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface SceneHandle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
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
  // Slight 3D-tilt so the box doesn't look like a flat square.
  camera.position.set(1.6, 1.0, 2.4);
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

  const resize = (width: number, height: number, dpr: number): void => {
    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };

  const dispose = (): void => {
    controls.dispose();
    renderer.dispose();
  };

  return { renderer, scene, camera, controls, resize, dispose };
}
