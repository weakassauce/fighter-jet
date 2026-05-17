import * as THREE from 'three';
import { WORLD } from './config.js';

// Shared terrain height function so trees, props, AI etc. can sample the same surface.
export function terrainHeight(x, z) {
  return (
    Math.sin(x * 0.00035) * 700 +
    Math.cos(z * 0.00041) * 600 +
    Math.sin((x + z * 0.7) * 0.0009) * 280 +
    Math.cos(x * 0.0021) * 90 +
    Math.sin(z * 0.0033) * 50
  );
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(WORLD.skyColor);
  scene.fog = new THREE.Fog(WORLD.skyColor, WORLD.fogNear, WORLD.fogFar);

  // Sun (directional)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(...WORLD.sunDir).normalize().multiplyScalar(1000);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe2ff, 0x3a5022, 0.55));

  // Ground: heightmap-displaced plane with tall mountain peaks
  const segments = 320;
  const geo = new THREE.PlaneGeometry(WORLD.groundSize, WORLD.groundSize, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // Vertex coloring: low = forest green, mid = brown, high = snowcap white
  const colors = new Float32Array(pos.count * 3);
  const cLow  = new THREE.Color(0x3d5a2a);
  const cMid  = new THREE.Color(0x6a5a3e);
  const cHigh = new THREE.Color(0xeef2f6);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    let col;
    if (h < 200) {
      const t = THREE.MathUtils.clamp((h + 200) / 400, 0, 1);
      col = tmpA.copy(cLow).lerp(cMid, t);
    } else {
      const t = THREE.MathUtils.clamp((h - 200) / 700, 0, 1);
      col = tmpB.copy(cMid).lerp(cHigh, t);
    }
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);

  // Trees — instanced mesh of trunk + leaves, only placed at forest altitudes.
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 5);
  trunkGeo.translate(0, 3, 0);
  const leavesGeo = new THREE.ConeGeometry(4, 12, 6);
  leavesGeo.translate(0, 12, 0);

  const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9, flatShading: true });
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2c5a28, roughness: 0.85, flatShading: true });

  const treeCount = 9000;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
  trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  leaves.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let placed = 0;
  let tries = 0;
  const maxTries = treeCount * 8;
  const placeRange = WORLD.groundSize * 0.45;
  while (placed < treeCount && tries < maxTries) {
    tries++;
    const x = (Math.random() * 2 - 1) * placeRange;
    const z = (Math.random() * 2 - 1) * placeRange;
    const y = terrainHeight(x, z);
    // Trees only in forest band: above water, below treeline
    if (y < -50 || y > 350) continue;
    const scale = 0.9 + Math.random() * 1.6;
    s.set(scale, scale, scale);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, y, z), q, s);
    trunks.setMatrixAt(placed, m);
    leaves.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed;
  leaves.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(leaves);

  // A few tall radio masts as landmarks
  const propMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.7 });
  const propGeo = new THREE.BoxGeometry(8, 80, 8);
  const propGroup = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2500 + Math.random() * (WORLD.groundSize * 0.3);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    const tower = new THREE.Mesh(propGeo, propMat);
    tower.position.set(x, y + 40, z);
    tower.scale.y = 0.5 + Math.random() * 2.2;
    propGroup.add(tower);
  }
  scene.add(propGroup);

  return { sun, ground, propGroup };
}
