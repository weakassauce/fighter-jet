import * as THREE from 'three';
import { ENEMIES, WORLD } from './config.js';
import { buildPlaceholderJet } from './jet.js';

export class Enemy {
  constructor(scene, template = null) {
    this.mesh = template ? template.clone(true) : buildPlaceholderJet({ color: 0x882222, accent: 0x111111 });
    this.mesh.scale.setScalar(1.0);
    scene.add(this.mesh);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.hull = ENEMIES.hull;
    this.dead = false;
    this.fireCooldown = 0;
    this._tmp = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
  }

  spawn(near) {
    const r = 1500 + Math.random() * 1500;
    const a = Math.random() * Math.PI * 2;
    this.position.set(near.x + Math.cos(a) * r, WORLD.startAltitude + (Math.random() - 0.5) * 400, near.z + Math.sin(a) * r);
    this.velocity.set(0, 0, -ENEMIES.speed);
    this.quaternion.identity();
    this.hull = ENEMIES.hull;
    this.dead = false;
  }

  update(dt, target) {
    if (this.dead) {
      this.mesh.visible = false;
      return null;
    }

    // Steer toward target
    const toTarget = this._tmp.copy(target.position).sub(this.position);
    const dist = toTarget.length();
    if (dist > 1) toTarget.divideScalar(dist);

    // Current forward
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);

    // Compute desired rotation axis: cross(fwd, toTarget)
    const axis = new THREE.Vector3().crossVectors(fwd, toTarget);
    const dot = THREE.MathUtils.clamp(fwd.dot(toTarget), -1, 1);
    const angle = Math.acos(dot);
    const step = Math.min(angle, ENEMIES.turnRate * dt);
    if (axis.lengthSq() > 1e-6 && step > 1e-4) {
      axis.normalize();
      this._tmpQ.setFromAxisAngle(axis, step);
      this.quaternion.premultiply(this._tmpQ);
    }

    // Move along (smoothed) forward
    const newFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    this.velocity.copy(newFwd).multiplyScalar(ENEMIES.speed);
    this.position.addScaledVector(this.velocity, dt);

    // Floor
    if (this.position.y < 50) this.position.y = 50;

    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);

    // Try to shoot
    let shot = null;
    this.fireCooldown -= dt;
    if (dist < ENEMIES.gunRange && Math.abs(angle) < 0.15 && this.fireCooldown <= 0) {
      this.fireCooldown = 0.8 + Math.random() * 0.6;
      shot = { from: this.position.clone(), dir: newFwd.clone() };
    }
    return shot;
  }

  takeDamage(d) {
    if (this.dead) return;
    this.hull -= d;
    if (this.hull <= 0) {
      this.dead = true;
      if (this._onDeath) this._onDeath(this.position.clone());
    }
  }
}

export class EnemyManager {
  constructor(scene, template = null) {
    this.scene = scene;
    this.list = [];
    this.onDeath = null;
    for (let i = 0; i < ENEMIES.count; i++) {
      const e = new Enemy(scene, template);
      e._onDeath = (pos) => { if (this.onDeath) this.onDeath(pos); };
      this.list.push(e);
    }
  }

  replaceMeshes(template) {
    for (const e of this.list) {
      this.scene.remove(e.mesh);
      e.mesh = template.clone(true);
      this.scene.add(e.mesh);
    }
  }

  spawnAll(playerPos) {
    for (const e of this.list) {
      e.mesh.visible = true;
      e.spawn(playerPos);
    }
  }

  update(dt, player, onShot) {
    for (const e of this.list) {
      const shot = e.update(dt, player);
      if (shot) onShot(shot);
    }
  }

  alive() { return this.list.filter((e) => !e.dead); }
}
