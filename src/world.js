import * as THREE from 'three';
import { WORLD } from './config.js';

export function buildWorld(scene) {
  scene.background = new THREE.Color(WORLD.skyColor);
  scene.fog = new THREE.Fog(WORLD.skyColor, WORLD.fogNear, WORLD.fogFar);

  // Sun (directional)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(...WORLD.sunDir).normalize().multiplyScalar(1000);
  sun.castShadow = false; // skip shadow maps for perf at this scale
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe2ff, 0x3a5022, 0.55));

  // Ground: heightmap-displaced plane gives a sense of motion
  const segments = 200;
  const geo = new THREE.PlaneGeometry(WORLD.groundSize, WORLD.groundSize, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Layered sin/cos pseudo-terrain
    const h =
      Math.sin(x * 0.0008) * 60 +
      Math.cos(z * 0.0011) * 50 +
      Math.sin((x + z) * 0.0023) * 22 +
      Math.cos(x * 0.0051) * 8;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: WORLD.groundColor,
    roughness: 0.95,
    flatShading: true,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);

  // Scatter some "structures" / props so motion is visible
  const propMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.7 });
  const propGeo = new THREE.BoxGeometry(40, 80, 40);
  const propGroup = new THREE.Group();
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(propGeo, propMat);
    const r = 2000 + Math.random() * (WORLD.groundSize * 0.35);
    const a = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(a) * r, 40, Math.sin(a) * r);
    m.scale.y = 0.5 + Math.random() * 2.5;
    propGroup.add(m);
  }
  scene.add(propGroup);

  return { sun, ground, propGroup };
}
