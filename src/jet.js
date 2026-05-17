import * as THREE from 'three';
import { JET, WORLD } from './config.js';

// Build a placeholder jet from primitives. Front = -Z, up = +Y. Swap out for GLB later.
export function buildPlaceholderJet({ color = 0x556677, accent = 0xff5555 } = {}) {
  const root = new THREE.Group();

  const matBody = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.55 });
  const matAccent = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.2, roughness: 0.7 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.9, roughness: 0.15 });

  // Fuselage
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 9, 16), matBody);
  fuselage.rotation.x = Math.PI / 2;
  root.add(fuselage);

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 16), matBody);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.5;
  root.add(nose);

  // Cockpit canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), matGlass);
  canopy.position.set(0, 0.45, -1.5);
  canopy.scale.set(1, 0.7, 1.6);
  root.add(canopy);

  // Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(5, -1); wingShape.lineTo(5, -2); wingShape.lineTo(0, -2.6); wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.18, bevelEnabled: false });
  const wingL = new THREE.Mesh(wingGeo, matBody); wingL.position.set(0, -0.05, 0.5); wingL.rotation.y = Math.PI; wingL.rotation.z = 0;
  const wingR = new THREE.Mesh(wingGeo, matBody); wingR.position.set(0, -0.05, 0.5);
  root.add(wingL); root.add(wingR);

  // Tail fins
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.4), matBody);
  tailV.position.set(0, 0.9, 4);
  root.add(tailV);

  const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 1.1), matBody);
  tailH.position.set(0, 0.1, 4);
  root.add(tailH);

  // Engine glow (purely cosmetic)
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0xffaa44 }));
  glow.position.set(0, 0, 4.55);
  glow.rotation.y = Math.PI;
  root.add(glow);

  // Tail accent stripes
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.3), matAccent);
  stripe.position.set(0, 0.9, 4.4);
  root.add(stripe);

  root.scale.setScalar(1.1);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// Sim flight model. State is position, velocity, orientation (quat), angular state implied by control inputs.
export class Jet {
  constructor(mesh) {
    this.mesh = mesh;
    this.position = new THREE.Vector3(0, WORLD.startAltitude, 0);
    this.velocity = new THREE.Vector3(0, 0, -WORLD.startSpeed);
    this.quaternion = new THREE.Quaternion();
    this.throttle = 0.75;
    this.throttleTarget = 0.75;
    this.hull = JET.maxHull;
    this.aoa = 0;
    this.stalled = false;
    this.dead = false;

    // Reusable temporaries
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpV = new THREE.Vector3();
  }

  reset() {
    this.position.set(0, WORLD.startAltitude, 0);
    this.velocity.set(0, 0, -WORLD.startSpeed);
    this.quaternion.identity();
    this.throttle = this.throttleTarget = 0.75;
    this.hull = JET.maxHull;
    this.stalled = false;
    this.dead = false;
  }

  forward(out = this._fwd) { return out.set(0, 0, -1).applyQuaternion(this.quaternion); }
  up(out = this._up)       { return out.set(0, 1, 0).applyQuaternion(this.quaternion); }
  right(out = this._right) { return out.set(1, 0, 0).applyQuaternion(this.quaternion); }

  update(dt, controls) {
    if (this.dead) return;

    // Throttle target tracking
    this.throttleTarget = THREE.MathUtils.clamp(this.throttleTarget + controls.throttle * dt * 0.6, 0, 1);
    this.throttle += (this.throttleTarget - this.throttle) * Math.min(1, dt * JET.throttleResponse * 4);

    // Apply control rotations in body frame
    const pitchAng = controls.pitch * JET.pitchRate * dt;
    const rollAng  = controls.roll  * JET.rollRate  * dt;
    const yawAng   = controls.yaw   * JET.yawRate   * dt;

    // Order: roll, pitch, yaw (intrinsic)
    this._tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rollAng); this.quaternion.multiply(this._tmpQ);
    this._tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchAng); this.quaternion.multiply(this._tmpQ);
    this._tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAng);   this.quaternion.multiply(this._tmpQ);
    this.quaternion.normalize();

    // Aerodynamics
    const fwd = this.forward();
    const up = this.up();
    const speed = this.velocity.length();

    // Angle of attack: angle between velocity and forward, signed in pitch plane
    let aoa = 0;
    if (speed > 1) {
      const vDir = this._tmpV.copy(this.velocity).divideScalar(speed);
      const dotF = THREE.MathUtils.clamp(vDir.dot(fwd), -1, 1);
      aoa = Math.acos(dotF);
      // Sign: positive when velocity is below nose (pulling Gs)
      if (vDir.dot(up) > 0) aoa = -aoa;
    }
    this.aoa = aoa;

    // Lift coefficient: linear up to stallAoA, then collapses
    const absAoA = Math.abs(aoa);
    this.stalled = absAoA > JET.stallAoA;
    const cl = this.stalled
      ? JET.liftSlope * JET.stallAoA * JET.postStallLift * Math.sign(aoa || 1)
      : JET.liftSlope * aoa;

    const q = 0.5 * JET.airDensity * speed * speed;     // dynamic pressure
    const liftMag = cl * q * JET.wingArea;
    const dragCoef = JET.parasiticDrag + JET.inducedDragK * cl * cl;
    const dragMag = dragCoef * q * JET.wingArea;

    // Forces (N) in world space
    const force = new THREE.Vector3();
    // Thrust along forward
    force.addScaledVector(fwd, JET.maxThrust * this.throttle);
    // Drag opposes velocity
    if (speed > 0.1) force.addScaledVector(this.velocity, -dragMag / speed);
    // Lift perpendicular to velocity, in body-up plane
    if (speed > 1) {
      // Build lift direction: perpendicular to velocity, in plane spanned by velocity and body up
      const vNorm = this._tmpV.copy(this.velocity).divideScalar(speed);
      const liftDir = new THREE.Vector3().copy(up).sub(vNorm.multiplyScalar(up.dot(this._tmpV.copy(this.velocity).divideScalar(speed))));
      if (liftDir.lengthSq() > 1e-6) liftDir.normalize();
      force.addScaledVector(liftDir, liftMag);
    }
    // Gravity
    force.y -= JET.mass * 9.81;

    // Integrate
    const accel = force.multiplyScalar(1 / JET.mass);
    this.velocity.addScaledVector(accel, dt);
    this.position.addScaledVector(this.velocity, dt);

    // Ground collision
    if (this.position.y < 5) {
      this.position.y = 5;
      if (this.velocity.y < 0) {
        // Impact damage scaled by descent rate
        const impact = -this.velocity.y;
        this.hull -= impact * 0.5;
        if (this.hull <= 0) this.dead = true;
        this.velocity.y = 0;
        // Bleed horizontal speed on belly slide
        this.velocity.x *= 0.95;
        this.velocity.z *= 0.95;
      }
    }

    // Apply to mesh
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);
  }

  takeDamage(d) {
    this.hull -= d;
    if (this.hull <= 0) this.dead = true;
  }
}
