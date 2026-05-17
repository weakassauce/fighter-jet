import * as THREE from 'three';

// Pooled explosions: bright additive fireball + dark smoke ball expanding over ~1s.
export class Explosions {
  constructor(scene, capacity = 24) {
    this.list = [];
    for (let i = 0; i < capacity; i++) {
      const fire = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffaa33, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0x202020, transparent: true, opacity: 0,
          depthWrite: false, fog: false,
        }),
      );
      fire.visible = false; smoke.visible = false;
      scene.add(fire); scene.add(smoke);
      this.list.push({ fire, smoke, life: 0, dur: 0, scale: 1 });
    }
    this.next = 0;
  }

  spawn(pos, scale = 30) {
    const s = this.list[this.next++ % this.list.length];
    s.fire.position.copy(pos);
    s.smoke.position.copy(pos);
    s.life = 0;
    s.dur = 0.9;
    s.scale = scale;
    s.fire.visible = true;
    s.smoke.visible = true;
  }

  update(dt) {
    for (const s of this.list) {
      if (!s.fire.visible && !s.smoke.visible) continue;
      s.life += dt;
      const t = s.life / s.dur;
      if (t >= 1) {
        s.fire.visible = false; s.smoke.visible = false;
        continue;
      }
      // Fireball: rapid grow, fade
      const fireGrow = 1 - Math.pow(1 - t, 2);
      s.fire.scale.setScalar(Math.max(0.5, s.scale * fireGrow));
      s.fire.material.opacity = Math.max(0, (1 - t) * 1.4);
      // Color shifts from yellow-orange to red as it dies
      s.fire.material.color.setHSL(0.08 - t * 0.07, 1.0, 0.55 - t * 0.25);
      // Smoke: slower grow, lingers
      const smokeGrow = Math.min(1, t * 1.6);
      s.smoke.scale.setScalar(s.scale * 1.1 * smokeGrow);
      s.smoke.material.opacity = Math.max(0, 0.55 * (1 - t * 0.7));
    }
  }
}
