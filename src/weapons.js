import * as THREE from 'three';
import { GUNS, MISSILE } from './config.js';

export class Bullets {
  constructor(scene, color = 0xfff2a8) {
    this.scene = scene;
    // Pool of points
    const cap = 1200;
    const positions = new Float32Array(cap * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 2.6, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.positions = positions;
    this.cap = cap;
    this.next = 0;
    this.life = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.damage = GUNS.damage;
  }

  spawn(pos, dir) {
    const i = this.next++ % this.cap;
    this.positions[i*3+0] = pos.x;
    this.positions[i*3+1] = pos.y;
    this.positions[i*3+2] = pos.z;
    this.vel[i*3+0] = dir.x * GUNS.muzzleSpeed;
    this.vel[i*3+1] = dir.y * GUNS.muzzleSpeed;
    this.vel[i*3+2] = dir.z * GUNS.muzzleSpeed;
    this.life[i] = GUNS.range / GUNS.muzzleSpeed;
  }

  update(dt, targets, onHit) {
    const p = this.positions, v = this.vel, l = this.life;
    for (let i = 0; i < this.cap; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      p[i*3+0] += v[i*3+0] * dt;
      p[i*3+1] += v[i*3+1] * dt;
      p[i*3+2] += v[i*3+2] * dt;
      // Hit-check (simple sphere test)
      for (const t of targets) {
        if (t.dead) continue;
        const dx = p[i*3+0] - t.position.x;
        const dy = p[i*3+1] - t.position.y;
        const dz = p[i*3+2] - t.position.z;
        if (dx*dx + dy*dy + dz*dz < 64) { // ~8m hit sphere
          onHit(t, this.damage);
          l[i] = 0;
          // Park bullet off-screen
          p[i*3+1] = -1e6;
          break;
        }
      }
      if (l[i] <= 0) p[i*3+1] = -1e6;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Missile {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.ConeGeometry(0.3, 1.4, 8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
    this.mesh = new THREE.Mesh(geo, mat);
    this.trail = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
    this.mesh.add(this.trail); this.trail.position.z = 0.9;
    scene.add(this.mesh);
    this.mesh.visible = false;
    this.alive = false;
  }

  fire(pos, vel, target) {
    this.position = pos.clone();
    this.velocity = vel.clone();
    if (this.velocity.length() < MISSILE.speed) this.velocity.setLength(MISSILE.speed);
    this.target = target;
    this.life = MISSILE.fuse;
    this.alive = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.position);
  }

  update(dt, onHit) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }

    // Steer toward target
    if (this.target && !this.target.dead) {
      const toTarget = new THREE.Vector3().subVectors(this.target.position, this.position).normalize();
      const cur = this.velocity.clone().normalize();
      const axis = new THREE.Vector3().crossVectors(cur, toTarget);
      const dot = THREE.MathUtils.clamp(cur.dot(toTarget), -1, 1);
      const angle = Math.acos(dot);
      const step = Math.min(angle, MISSILE.turnRate * dt);
      if (axis.lengthSq() > 1e-6 && step > 1e-4) {
        axis.normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(axis, step);
        this.velocity.applyQuaternion(q);
      }
    }

    // Accelerate up to maxSpeed
    const speed = this.velocity.length();
    if (speed < MISSILE.maxSpeed) {
      this.velocity.setLength(Math.min(MISSILE.maxSpeed, speed + MISSILE.acceleration * dt));
    }
    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);
    this.mesh.lookAt(this.position.clone().add(this.velocity));

    // Proximity detonation
    if (this.target && !this.target.dead) {
      const d2 = this.position.distanceToSquared(this.target.position);
      if (d2 < 36*36) {
        onHit(this.target, MISSILE.damage);
        this.kill();
      }
    }
    if (this.position.y < 0) this.kill();
  }

  kill() {
    this.alive = false;
    this.mesh.visible = false;
    this.target = null;
  }
}
