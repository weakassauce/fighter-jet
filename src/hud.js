import * as THREE from 'three';
import { RADAR, JET } from './config.js';

// 2D canvas overlay HUD: airspeed, altitude, heading tape, throttle, AoA, stall warning, hull bar, radar.

export class HUD {
  constructor() {
    this.canvas = document.querySelector('#hud canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  draw({ jet, enemies, lockTarget }) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // Style
    ctx.strokeStyle = '#9fffa6';
    ctx.fillStyle = '#9fffa6';
    ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    ctx.lineWidth = 1.5;

    // Center crosshair (gun pipper)
    const cx = W / 2, cy = H / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 16); ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    // Pitch ladder
    this._drawPitchLadder(jet, cx, cy);

    // Airspeed tape (left)
    const speed = jet.velocity.length();
    this._tape(60, H/2, 'IAS', `${Math.round(speed * 1.94384)}`, 'kt'); // m/s → kt

    // Altitude tape (right)
    this._tape(W - 60, H/2, 'ALT', `${Math.round(jet.position.y * 3.28084)}`, 'ft'); // m → ft

    // Heading (top)
    const fwd = jet.forward().clone(); fwd.y = 0; fwd.normalize();
    let heading = (Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI + 360) % 360;
    this._heading(W/2, 32, heading);

    // Throttle (bottom-left vertical bar)
    this._bar(40, H - 200, 14, 160, jet.throttle, 'THR', '#ffaa44');

    // Hull (bottom-right)
    this._bar(W - 54, H - 200, 14, 160, Math.max(0, jet.hull / JET.maxHull), 'HUL', '#ff5555');

    // AoA + stall
    ctx.fillText(`AoA ${(jet.aoa * 180 / Math.PI).toFixed(1)}°`, 24, H - 24);
    if (jet.stalled) {
      ctx.fillStyle = '#ff3030';
      ctx.fillText('STALL', cx - 22, cy + 40);
      ctx.fillStyle = '#9fffa6';
    }

    // Radar (bottom-center)
    this._radar(cx, H - RADAR.size/2 - 24, jet, enemies);

    // Lock indicator
    if (lockTarget && !lockTarget.dead) {
      const screen = this._project(lockTarget.position, jet);
      if (screen) {
        ctx.strokeStyle = '#ff5555';
        ctx.strokeRect(screen.x - 18, screen.y - 18, 36, 36);
        ctx.fillStyle = '#ff5555';
        ctx.fillText('LOCK', screen.x + 22, screen.y - 18);
        ctx.fillStyle = '#9fffa6';
        ctx.strokeStyle = '#9fffa6';
      }
    }

    // Targets boxed (faded) when on-screen
    for (const e of enemies) {
      if (e.dead) continue;
      const s = this._project(e.position, jet);
      if (s) {
        ctx.strokeStyle = 'rgba(159,255,166,0.55)';
        ctx.strokeRect(s.x - 12, s.y - 12, 24, 24);
      }
    }

    ctx.restore();
  }

  _drawPitchLadder(jet, cx, cy) {
    const ctx = this.ctx;
    // Project body forward into screen-relative pitch/roll feel
    const fwd = jet.forward();
    const up = jet.up();
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
    // Bank: angle between body up and world up projected to right axis
    const right = jet.right();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const bank = Math.atan2(right.y, up.y);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank);
    ctx.strokeStyle = 'rgba(159,255,166,0.7)';
    for (let deg = -30; deg <= 30; deg += 10) {
      const off = (pitch * 180 / Math.PI - deg) * 8;
      const y = off;
      if (Math.abs(y) > 220) continue;
      const len = deg === 0 ? 160 : 80;
      ctx.beginPath();
      ctx.moveTo(-len, y);
      ctx.lineTo(len, y);
      ctx.stroke();
      if (deg !== 0) {
        ctx.fillStyle = '#9fffa6';
        ctx.fillText(`${deg}`, len + 6, y + 4);
        ctx.fillText(`${deg}`, -len - 22, y + 4);
      }
    }
    ctx.restore();
  }

  _tape(x, y, label, value, unit) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#9fffa6';
    ctx.strokeRect(x - 42, y - 18, 84, 36);
    ctx.fillText(label, x - 38, y - 22);
    ctx.font = '18px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(value, x - 36, y + 6);
    ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(unit, x + 18, y + 6);
  }

  _heading(x, y, deg) {
    const ctx = this.ctx;
    ctx.strokeRect(x - 60, y - 14, 120, 24);
    ctx.fillText(`HDG ${Math.round(deg).toString().padStart(3, '0')}°`, x - 38, y + 4);
  }

  _bar(x, y, w, h, v, label, color) {
    const ctx = this.ctx;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color;
    const fill = h * THREE.MathUtils.clamp(v, 0, 1);
    ctx.fillRect(x + 1, y + h - fill + 1, w - 2, fill - 2);
    ctx.fillStyle = '#9fffa6';
    ctx.fillText(label, x - 4, y + h + 16);
  }

  _radar(cx, cy, jet, enemies) {
    const ctx = this.ctx;
    const r = RADAR.size / 2;
    // Frame
    ctx.strokeStyle = '#9fffa6';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();

    // Plot enemies (in jet's heading-rotated top-down frame)
    const fwd = jet.forward().clone(); fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) return;
    fwd.normalize();
    const rightW = new THREE.Vector3(fwd.z, 0, -fwd.x);
    for (const e of enemies) {
      if (e.dead) continue;
      const rel = new THREE.Vector3().subVectors(e.position, jet.position);
      const fx = rel.dot(rightW);
      const fz = rel.dot(fwd);
      const range = Math.hypot(fx, fz);
      if (range > RADAR.range) continue;
      const px = cx + (fx / RADAR.range) * r;
      const py = cy - (fz / RADAR.range) * r;
      ctx.fillStyle = '#ff5555';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    ctx.fillStyle = '#9fffa6';
    ctx.fillText(`RDR ${(RADAR.range/1000).toFixed(0)}km`, cx - r, cy + r + 14);
  }

  _project(worldPos, jet) {
    // Cheap projection via the active perspective camera attached to window._cam (set by main.js)
    const cam = window._cam;
    if (!cam) return null;
    const v = worldPos.clone().project(cam);
    if (v.z > 1 || v.z < -1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * this.canvas.width,
      y: (-v.y * 0.5 + 0.5) * this.canvas.height,
    };
  }
}
