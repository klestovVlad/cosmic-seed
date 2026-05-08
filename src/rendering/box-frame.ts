import * as THREE from 'three';

// Thin wireframe cube + faint corner ticks marking the periodic-box
// boundary. Without it the box looks like a hard wall; with it the user
// can see what is the simulation volume vs what's empty.

export interface BoxFrame {
  readonly object: THREE.Object3D;
  dispose(): void;
}

export function createBoxFrame(halfExtent: number, color = '#5b3f8e'): BoxFrame {
  const root = new THREE.Group();
  const L = 2 * halfExtent;
  const c = new THREE.Color(color);

  // Edges: BoxGeometry → EdgesGeometry → LineSegments. Restrained alpha so
  // the wireframe doesn't fight the particle cloud for attention.
  const box = new THREE.BoxGeometry(L, L, L);
  const edges = new THREE.EdgesGeometry(box);
  const lineMat = new THREE.LineBasicMaterial({
    color: c,
    transparent: true,
    // Restrained — the wireframe is a "hint, not a wall". Earlier 0.35 made
    // it dominate the visual; 0.12 keeps it as a peripheral cue.
    opacity: 0.12,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(edges, lineMat);
  root.add(lines);
  box.dispose();

  return {
    object: root,
    dispose(): void {
      edges.dispose();
      lineMat.dispose();
    },
  };
}
