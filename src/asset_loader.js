import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Try to load a GLB; resolve null on failure (so we fall back to placeholder geometry).
export async function tryLoadGLB(url) {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (g) => resolve(g.scene),
      undefined,
      () => resolve(null),
    );
  });
}

// Normalize an imported model so its "forward" is -Z, sized to ~10m, centered, casting shadows.
export function normalizeJetModel(root, targetLength = 10) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis > 0) root.scale.setScalar(targetLength / maxAxis);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// Ask AssetForge to start a generation job. Returns job id. Uses /forge prefix (vite proxy).
export async function forgeRequest(prompt) {
  const r = await fetch('/forge/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, grid_size: 2, animate: false }),
  });
  if (!r.ok) throw new Error(`forge ${r.status}`);
  return r.json();
}

export async function forgeStatus(jobId) {
  const r = await fetch(`/forge/generate/${jobId}`);
  if (!r.ok) throw new Error(`forge status ${r.status}`);
  return r.json();
}
