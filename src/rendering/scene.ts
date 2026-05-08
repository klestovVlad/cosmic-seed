import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Layer mask for objects that should bloom. Only the star cloud opts in;
 * DM and gas particle clouds stay on layer 0 only and are rendered as
 * black during the bloom pass so they don't contribute luminance to the
 * blur kernel — UnrealBloomPass would otherwise treat the additive-
 * blended DM density spikes as bloomable, drowning the cosmic web in a
 * single white halo. Three.js examples ship the same selective-bloom
 * pattern (`webgl_postprocessing_unreal_bloom_selective`).
 */
export const BLOOM_LAYER = 1;

export interface SceneHandle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Render the layered bloom pipeline. Replaces the per-frame
   *  `composer.render()` call from before selective bloom landed. */
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
    gl_FragColor = base + bloom;
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
  // Camera is INSIDE the periodic box: edges of the wireframe go off-screen,
  // viewport shows the interior of the simulated volume.
  camera.position.set(0.7, 0.45, 1.05);
  camera.lookAt(0, 0, 0);
  // Camera renders all layers; the bloom-pass swap happens at the material
  // level, not via camera layers.
  camera.layers.enableAll();

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 20;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45; // ≈ 1 rev / 90 s

  // --- Selective-bloom pipeline ----------------------------------------
  //
  // Two composers chain like so:
  //
  //   bloomComposer:  RenderPass (with non-bloom objects darkened)
  //                 → UnrealBloomPass (writes its blurred output to
  //                                    bloomComposer.renderTarget2)
  //
  //   finalComposer:  RenderPass (full scene, normal materials)
  //                 → composite ShaderPass (adds bloomComposer's texture)
  //                 → OutputPass (tone map + sRGB)
  //
  // Per frame we traverse the scene once to swap non-BLOOM_LAYER objects'
  // materials to a black MeshBasicMaterial, render bloomComposer, restore
  // materials, render finalComposer. Cost: one extra RenderPass + the
  // bloom passes' downsamples. At 4 k DM particles this is well inside
  // budget (the bloom kernel is 5 mips of 1280×800 quads).

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    /* strength */ 1.1,
    /* radius   */ 0.55,
    // Threshold can drop now that DM/gas are pre-darkened: stars are the
    // only luminance left in the bloom render, so a low threshold gives
    // them headroom to glow while costing nothing on the dark cloud.
    /* threshold*/ 0.0,
  );
  bloomComposer.addPass(bloom);

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

  // --- Material swap for the bloom pass --------------------------------

  const bloomLayer = new THREE.Layers();
  bloomLayer.set(BLOOM_LAYER);
  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const stashedMaterials = new Map<string, THREE.Material | THREE.Material[]>();

  function darkenIfNotBloom(obj: THREE.Object3D): void {
    // Points + Mesh + Line all expose `.material`. Skip anything else.
    const candidate = obj as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
    if (candidate.material === undefined) return;
    if (bloomLayer.test(obj.layers)) return; // opted-in, leave bright
    stashedMaterials.set(obj.uuid, candidate.material);
    candidate.material = darkMaterial;
  }

  function restoreMaterial(obj: THREE.Object3D): void {
    const stashed = stashedMaterials.get(obj.uuid);
    if (stashed === undefined) return;
    const candidate = obj as THREE.Object3D & { material: THREE.Material | THREE.Material[] };
    candidate.material = stashed;
    stashedMaterials.delete(obj.uuid);
  }

  const render = (): void => {
    scene.traverse(darkenIfNotBloom);
    bloomComposer.render();
    scene.traverse(restoreMaterial);
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
    darkMaterial.dispose();
    renderer.dispose();
  };

  return { renderer, scene, camera, controls, render, resize, dispose };
}
