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

// Async: replace with a generated jet if /assets/player_jet.glb exists
tryLoadGLB('/assets/player_jet.glb').then((g) => {
  if (!g) return;
  jet.mesh.clear();
  jet.mesh.add(normalizeJetModel(g, 10));
});

// Enemies
const enemies = new EnemyManager(scene);
enemies.spawnAll(jet.position);

tryLoadGLB('/assets/enemy_jet.glb').then((g) => {
  if (!g) return;
  enemies.replaceMeshes(normalizeJetModel(g, 9));
});

// Cockpit interior — attached to the camera, visible only in cockpit view.
// Loaded lazily; until then, cockpit view is just an empty FPV.
scene.add(camera); // camera must be in scene graph for children to render
const cockpitGroup = new THREE.Group();
cockpitGroup.visible = false;
camera.add(cockpitGroup);
// Cockpit fill lighting — three sources so panels stay bright from every angle.
// Key light from front-above (canopy daylight feel)
const cockpitKey = new THREE.PointLight(0xfff4d8, 3.0, 6, 1.2);
cockpitKey.position.set(0, 0.8, -0.5);
cockpitGroup.add(cockpitKey);
// Underglow from instrument panel (green/amber feel)
const cockpitGlow = new THREE.PointLight(0xa0ffb0, 0.8, 3, 1.5);
cockpitGlow.position.set(0, -0.3, -0.6);
cockpitGroup.add(cockpitGlow);
// Ambient bounce so dark corners don't disappear
const cockpitAmb = new THREE.AmbientLight(0xb0c8e0, 0.5);
cockpitGroup.add(cockpitAmb);
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

  // HUD
  hud.draw({ jet, enemies: enemies.list, lockTarget });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

const camOffsetChase = new THREE.Vector3(0, 3.2, 14);
const camOffsetCockpit = new THREE.Vector3(0, 0.7, -1.0);
const camTmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const offset = view === 'chase' ? camOffsetChase : camOffsetCockpit;
  camTmp.copy(offset).applyQuaternion(jet.quaternion).add(jet.position);
  // Smooth follow
  const lerp = view === 'chase' ? 1 - Math.exp(-dt * 6) : 1.0;
  camera.position.lerp(camTmp, lerp);
  // Look slightly ahead of the jet
  camTarget.copy(jet.position).addScaledVector(jet.forward(), view === 'chase' ? 30 : 200);
  if (view === 'cockpit') camTarget.y += 0; // straight ahead
  camera.up.copy(jet.up());
  camera.lookAt(camTarget);

  // Show cockpit only in cockpit view + hide player jet so we don't see its inside
  cockpitGroup.visible = (view === 'cockpit');
  jet.mesh.visible = (view !== 'cockpit');
}

requestAnimationFrame(frame);
