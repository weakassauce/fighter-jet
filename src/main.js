import * as THREE from 'three';
import { JET, GUNS, MISSILE } from './config.js';
import { buildPlaceholderJet, Jet } from './jet.js';
import { buildWorld } from './world.js';
import { EnemyManager } from './enemies.js';
import { Bullets, Missile } from './weapons.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { tryLoadGLB, normalizeJetModel } from './asset_loader.js';

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 30000);
window._cam = camera;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

buildWorld(scene);

// Player jet (placeholder; swap GLB in async below)
const jetMesh = buildPlaceholderJet({ color: 0x556677, accent: 0xffaa33 });
scene.add(jetMesh);
const jet = new Jet(jetMesh);

// Async: replace with a generated jet if /assets/player_jet.glb exists.
// TRELLIS GLBs come out facing +Z (toward the chase camera) so we flip 180°
// to align the nose with the jet's -Z forward.
tryLoadGLB('/assets/player_jet.glb').then((g) => {
  if (!g) return;
  jet.mesh.clear();
  const norm = normalizeJetModel(g, 10);
  norm.rotation.y = Math.PI;
  jet.mesh.add(norm);
});

// Enemies
const enemies = new EnemyManager(scene);
enemies.spawnAll(jet.position);

tryLoadGLB('/assets/enemy_jet.glb').then((g) => {
  if (!g) return;
  const norm = normalizeJetModel(g, 9);
  norm.rotation.y = Math.PI;
  enemies.replaceMeshes(norm);
});

// Cockpit interior — attached to the camera, visible only in cockpit view.
// Loaded lazily; until then, cockpit view is just an empty FPV.
scene.add(camera); // camera must be in scene graph for children to render
const cockpitGroup = new THREE.Group();
cockpitGroup.visible = false;
camera.add(cockpitGroup);
// Directional, shape-revealing lighting — adds shading/contrast across surfaces
// (switches, dials, panel edges) without flattening color or adding overall brightness.

// Original soft warm fill, kept so panels never go pitch dark.
const cockpitLight = new THREE.PointLight(0xfff0c8, 1.0, 4, 1.5);
cockpitLight.position.set(0, 0.4, -0.2);
cockpitGroup.add(cockpitLight);

// Raking side directional — creates shadow/highlight gradient across the dash,
// pulling switches and rivets out of the surface. Low intensity so it shapes
// without brightening.
const cockpitRake = new THREE.DirectionalLight(0xffffff, 0.5);
cockpitRake.position.set(1.0, 0.4, -0.3);
cockpitRake.target.position.set(0, 0, -0.6);
cockpitGroup.add(cockpitRake);
cockpitGroup.add(cockpitRake.target);

// Rim from behind/below — picks out canopy frame edges and console silhouettes
// against the brighter sky/world.
const cockpitRim = new THREE.DirectionalLight(0xb8d4ff, 0.35);
cockpitRim.position.set(-0.4, -0.3, 0.6);
cockpitRim.target.position.set(0, 0.2, -0.4);
cockpitGroup.add(cockpitRim);
cockpitGroup.add(cockpitRim.target);

// Hemisphere instead of ambient — gives subtle sky/ground tint variation that
// reveals surface orientation, instead of flattening like flat ambient does.
const cockpitHemi = new THREE.HemisphereLight(0xccd8e6, 0x2a2a30, 0.25);
cockpitGroup.add(cockpitHemi);
// Cockpit tuning — exposed on window for live tweaking from devtools.
const COCKPIT_TUNE = { scale: 2.2, x: 0, y: -0.55, z: -0.35, rotY: 0 };
window.cockpit = COCKPIT_TUNE;
let cockpitModel = null;
function applyCockpitTune() {
  if (!cockpitModel) return;
  cockpitModel.position.set(COCKPIT_TUNE.x, COCKPIT_TUNE.y, COCKPIT_TUNE.z);
  cockpitModel.rotation.y = COCKPIT_TUNE.rotY;
  cockpitModel.scale.setScalar(COCKPIT_TUNE.scale / (cockpitModel.userData.maxAxis || 1));
}
window.applyCockpit = applyCockpitTune;

tryLoadGLB('/assets/cockpit.glb').then((g) => {
  if (!g) return;
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  g.position.sub(center);
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  g.userData.maxAxis = maxAxis;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
      if (o.material) { o.material.fog = false; o.material.toneMapped = true; }
    }
  });
  cockpitModel = g;
  cockpitGroup.add(g);
  applyCockpitTune();
});

// Engine flames — additive cones behind the jet, scaled by throttle, breathing.
const flameOuterGeo = new THREE.ConeGeometry(0.7, 4.5, 14, 1, true);
flameOuterGeo.rotateX(Math.PI / 2);   // tip points along +Z (jet's backward)
flameOuterGeo.translate(0, 0, 2.25);
const flameInnerGeo = new THREE.ConeGeometry(0.35, 2.6, 10, 1, true);
flameInnerGeo.rotateX(Math.PI / 2);
flameInnerGeo.translate(0, 0, 1.3);
const flameOuter = new THREE.Mesh(flameOuterGeo, new THREE.MeshBasicMaterial({
  color: 0xff7733, transparent: true, opacity: 0.75,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
}));
const flameInner = new THREE.Mesh(flameInnerGeo, new THREE.MeshBasicMaterial({
  color: 0xffeebb, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
}));
const flameGroup = new THREE.Group();
flameGroup.add(flameOuter); flameGroup.add(flameInner);
scene.add(flameGroup);

function updateFlame(time) {
  const back = jet.forward().multiplyScalar(-4.8).add(jet.position);
  flameGroup.position.copy(back);
  flameGroup.quaternion.copy(jet.quaternion);
  const thr = jet.throttle;
  const breath = 0.85 + Math.sin(time * 35) * 0.07 + Math.sin(time * 91) * 0.04;
  const len = (0.4 + thr * 1.8) * breath;
  const width = (0.65 + thr * 0.35) * breath;
  flameOuter.scale.set(width, width, len);
  flameInner.scale.set(width * 0.9, width * 0.9, len * 0.65);
  flameOuter.material.opacity = 0.55 + thr * 0.4;
  flameInner.material.opacity = 0.85 + thr * 0.1;
  flameGroup.visible = thr > 0.02 && !jet.dead && view !== 'cockpit';
}

// Weapons
const playerBullets = new Bullets(scene, 0xfff2a8);
const enemyBullets = new Bullets(scene, 0xff8844);
const missiles = [new Missile(scene), new Missile(scene), new Missile(scene), new Missile(scene)];
let missileCooldown = 0;

const input = new Input();
const hud = new HUD();

let view = 'cockpit'; // 'cockpit' | 'chase'  — first-person by default
let gunCooldown = 0;
let lockTarget = null;

function pickLock() {
  // Lock onto closest enemy within cone and range
  const fwd = jet.forward();
  let best = null, bestScore = MISSILE.lockCone;
  for (const e of enemies.list) {
    if (e.dead) continue;
    const to = new THREE.Vector3().subVectors(e.position, jet.position);
    const dist = to.length();
    if (dist > MISSILE.lockRange) continue;
    to.divideScalar(dist);
    const dot = fwd.dot(to);
    if (dot > bestScore) { bestScore = dot; best = e; }
  }
  lockTarget = best;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const ax = input.axes();
  jet.update(dt, ax);

  // Drain edge-triggered actions
  for (const a of input.drainActions()) {
    if (a === 'reset') { jet.reset(); enemies.spawnAll(jet.position); }
    if (a === 'toggleView') view = view === 'chase' ? 'cockpit' : 'chase';
    if (a === 'fireMissile' && missileCooldown <= 0 && lockTarget && !lockTarget.dead) {
      const slot = missiles.find((m) => !m.alive);
      if (slot) {
        const pos = jet.position.clone().addScaledVector(jet.forward(), 6);
        const vel = jet.velocity.clone().add(jet.forward().multiplyScalar(80));
        slot.fire(pos, vel, lockTarget);
        missileCooldown = 1.2;
      }
    }
  }
  missileCooldown -= dt;

  // Continuous gun fire
  gunCooldown -= dt;
  if (ax.firingGuns && gunCooldown <= 0) {
    gunCooldown = 1 / GUNS.rateOfFire;
    const dir = jet.forward().clone();
    // Add a touch of spread + inherit velocity
    dir.x += (Math.random() - 0.5) * GUNS.spread;
    dir.y += (Math.random() - 0.5) * GUNS.spread;
    dir.normalize();
    const pos = jet.position.clone().addScaledVector(jet.forward(), 5);
    playerBullets.spawn(pos, dir);
  }

  // Update enemies & gather their shots
  enemies.update(dt, jet, (shot) => {
    enemyBullets.spawn(shot.from, shot.dir);
  });

  // Lock targeting (every frame; cheap)
  pickLock();

  // Resolve bullet damage
  playerBullets.update(dt, enemies.list, (target, dmg) => target.takeDamage(dmg));
  enemyBullets.update(dt, [jet], (_, dmg) => jet.takeDamage(dmg));

  // Missiles
  for (const m of missiles) m.update(dt, (target, dmg) => target.takeDamage(dmg));

  // Camera
  updateCamera(dt);

  // Engine flame
  updateFlame(now * 0.001);

  // HUD
  hud.draw({ jet, enemies: enemies.list, lockTarget });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

const camOffsetChase = new THREE.Vector3(0, 3.2, 14);
const camOffsetCockpit = new THREE.Vector3(0, 0.7, -1.0);
const camTmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0);
function updateCamera(dt) {
  const offset = view === 'chase' ? camOffsetChase : camOffsetCockpit;
  camTmp.copy(offset).applyQuaternion(jet.quaternion).add(jet.position);
  // Tight follow in chase, snap in cockpit
  const posLerp = view === 'chase' ? 1 - Math.exp(-dt * 14) : 1.0;
  camera.position.lerp(camTmp, posLerp);
  // Look ahead of the jet
  camTarget.copy(jet.position).addScaledVector(jet.forward(), view === 'chase' ? 30 : 200);
  if (view === 'chase') {
    // World-up chase cam: smoothly tracks roll without spinning the world during rolls
    camUp.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-dt * 6));
    camera.up.copy(camUp);
  } else {
    // Cockpit view stays welded to the jet so the world feels right through the canopy
    camera.up.copy(jet.up());
  }
  camera.lookAt(camTarget);

  // Show cockpit only in cockpit view + hide player jet so we don't see its inside
  cockpitGroup.visible = (view === 'cockpit');
  jet.mesh.visible = (view !== 'cockpit');
}

requestAnimationFrame(frame);
