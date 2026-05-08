import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Layer mask for objects that should bloom. Only the star cloud opts in.
 *
 * Selective-bloom approach: we run two render passes with the same camera
 * but different `camera.layers` masks. The bloom pass renders ONLY layer
 * BLOOM_LAYER (stars), gets blurred by UnrealBloomPass, and writes to a
 * texture. The final pass renders all layers normally and additively
 * composites the bloom texture on top.
 *
 * No material swaps — the camera-layer filter at the renderer's culling
 * stage is precise (and side-effect-free) where the swap-and-restore
 * pattern produces black-square artifacts on `THREE.Points` because
 * `MeshBasicMaterial` doesn't speak the points' gl_PointSize / sprite
 * vocabulary.
 */
export const BLOOM_LAYER = 1;

export interface SceneHandle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Layered selective-bloom render. Replaces the old per-frame
   *  `composer.render()`. */
  render(): void;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}

const COMPOSITE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D baseTexture;
  uniform sampler2D bloomTexture;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(baseTexture, vUv);
    vec4 bloom = texture2D(bloomTexture, vUv);
    // Add bloom RGB to base RGB; preserve base alpha so the canvas keeps
    // its transparency for any non-rendered pixels.
    gl_FragColor = vec4(base.rgb + bloom.rgb, base.a);
  }
`;

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
  // Camera positioned OUTSIDE the periodic box so the whole 1×1×1 volume
  // reads as a 3D object: cosmic web visible as a structure inside a
  // wireframe cube, not a soup of giant sprites filling the viewport.
  // Distance ≈ 2.6 (vs box diagonal ≈ 0.87) — box fills the centre of
  // the viewport with breathing room around it.
  camera.position.set(1.4, 0.9, 2.1);
  camera.lookAt(0, 0, 0);
  camera.layers.enableAll();

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.7;
  controls.maxDistance = 20;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  // Static by default. Auto-rotate creates a per-frame visual delta that
  // reads as "мельтешит" against the cosmic web — the user can grab and
  // orbit if they want.
  controls.autoRotate = false;

  // --- Bloom composer: renders only BLOOM_LAYER objects through a blur ---

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    // Strength tuned down: with stars now meant to be 1–3 distinct
    // events (not a fireworks display), each one should read as a
    // contained luminous source, not a plate-sized smear.
    /* strength */ 0.7,
    /* radius   */ 0.45,
    // Threshold can be 0 because the bloom pass renders only layer 1
    // (stars). DM and gas are simply not rendered there — they don't need
    // to be darkened or thresholded out.
    /* threshold*/ 0.0,
  );
  bloomComposer.addPass(bloom);

  // --- Final composer: full scene + bloom-overlay composite -----------

  const compositePass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      defines: {},
    }),
    'baseTexture',
  );
  compositePass.needsSwap = true;

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));
  finalComposer.addPass(compositePass);
  finalComposer.addPass(new OutputPass());

  const render = (): void => {
    // Bloom pass: camera sees only layer BLOOM_LAYER. DM, gas, box-frame —
    // none of them are on this layer, so RenderPass renders nothing for
    // them. Stars opt in (`object.layers.enable(BLOOM_LAYER)`), get
    // rendered, then UnrealBloomPass blurs the result.
    camera.layers.set(BLOOM_LAYER);
    bloomComposer.render();
    // Final pass: camera sees all layers, normal scene render, then
    // additively composite the bloom texture, then tone-map to sRGB.
    camera.layers.enableAll();
    finalComposer.render();
  };

  const resize = (width: number, height: number, dpr: number): void => {
    const pr = Math.min(dpr, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    bloomComposer.setPixelRatio(pr);
    bloomComposer.setSize(width, height);
    finalComposer.setPixelRatio(pr);
    finalComposer.setSize(width, height);
    bloom.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };

  const dispose = (): void => {
    controls.dispose();
    bloomComposer.dispose();
    finalComposer.dispose();
    renderer.dispose();
  };

  return { renderer, scene, camera, controls, render, resize, dispose };
}
