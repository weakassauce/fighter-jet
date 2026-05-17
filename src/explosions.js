import * as THREE from 'three';

// Pooled explosions: intense additive fireball, expanding smoke, and tumbling debris.
export class Explosions {
  constructor(scene, capacity = 24, debrisPerHit = 14) {
    this.list = [];
    for (let i = 0; i < capacity; i++) {
      const fire = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffcc44, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0x1a1a1a, transparent: true, opacity: 0,
          depthWrite: false, fog: false,
        }),
      );
      fire.visible = false; flash.visible = false; smoke.visible = false;
      scene.add(fire); scene.add(flash); scene.add(smoke);
      this.list.push({ fire, flash, smoke, life: 0, dur: 0, scale: 1 });
    }
    this.next = 0;

    // Debris pool — small boxes that fly out, tumble, fall under gravity, fade.
    this.debrisCap = capacity * debrisPerHit;
    this.debris = [];
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a, roughness: 0.85, metalness: 0.2, flatShading: true, transparent: true,
    });
    for (let i = 0; i < this.debrisCap; i++) {
      // Vary the piece shape a bit so it doesn't look like one tile
      const sx = 0.4 + Math.random() * 0.8;
      const sy = 0.3 + Math.random() * 0.6;
      const sz = 0.6 + Math.random() * 1.0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), debrisMat.clone());
      m.visible = false;
      scene.add(m);
      this.debris.push({
        mesh: m,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0, dur: 0,
      });
    }
    this.debrisNext = 0;
    this.debrisPerHit = debrisPerHit;
  }

  spawn(pos, scale = 30) {
    const s = this.list[this.next++ % this.list.length];
    s.fire.position.copy(pos);
    s.flash.position.copy(pos);
    s.smoke.position.copy(pos);
    s.life = 0;
    s.dur = 1.1;
    s.scale = scale;
    s.fire.visible = true;
    s.flash.visible = true;
    s.smoke.visible = true;

    // Spawn debris that radiates outward
    for (let i = 0; i < this.debrisPerHit; i++) {
      const d = this.debris[this.debrisNext++ % this.debris.length];
      d.mesh.position.copy(pos);
      // Launch in a hemisphere biased upward
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 1.6);   // 0..~70°
      const sp = 18 + Math.random() * 32;
      d.vel.set(
        Math.sin(phi) * Math.cos(theta) * sp,
        Math.cos(phi) * sp + 6,
        Math.sin(phi) * Math.sin(theta) * sp,
      );
      d.spin.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
      d.mesh.scale.setScalar(0.7 + Math.random() * 1.6);
      d.mesh.material.opacity = 1;
      d.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.life = 0;
      d.dur = 2.5 + Math.random() * 2.0;
      d.mesh.visible = true;
    }
  }

  update(dt) {
    for (const s of this.list) {
      if (!s.fire.visible && !s.smoke.visible && !s.flash.visible) continue;
      s.life += dt;
      const t = s.life / s.dur;
      if (t >= 1) {
        s.fire.visible = false; s.smoke.visible = false; s.flash.visible = false;
        continue;
      }
      // Initial white flash (front-loaded, gone by t=0.2)
      if (t < 0.2) {
        s.flash.scale.setScalar(s.scale * (0.6 + t * 4));
        s.flash.material.opacity = (1 - t / 0.2);
      } else {
        s.flash.visible = false;
      }
      // Fireball: rapid grow, hot orange → red, fade
      const fireGrow = 1 - Math.pow(1 - t, 2);
      s.fire.scale.setScalar(Math.max(0.5, s.scale * 1.3 * fireGrow));
      s.fire.material.opacity = Math.max(0, (1 - t) * 1.6);
      s.fire.material.color.setHSL(0.10 - t * 0.09, 1.0, 0.6 - t * 0.3);
      // Smoke: slower grow, lingers
      const smokeGrow = Math.min(1, t * 1.4);
      s.smoke.scale.setScalar(s.scale * 1.4 * smokeGrow);
      s.smoke.material.opacity = Math.max(0, 0.65 * (1 - t * 0.6));
    }

    // Debris physics + fade
    for (const d of this.debris) {
      if (!d.mesh.visible) continue;
      d.life += dt;
      if (d.life >= d.dur) { d.mesh.visible = false; continue; }
      d.vel.y -= 9.81 * 1.2 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      // Fade in last 30% of life
      const ft = d.life / d.dur;
      d.mesh.material.opacity = ft > 0.7 ? Math.max(0, (1 - (ft - 0.7) / 0.3)) : 1;
    }
  }
}
