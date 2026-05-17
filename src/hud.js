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

  draw({ jet, enemies, lockTarget, lockProgress = 0 }) {
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

    // Lock indicator — yellow box while acquiring, red box + brackets when full lock
    if (lockTarget && !lockTarget.dead) {
      const screen = this._project(lockTarget.position, jet);
      if (screen) {
        const full = lockProgress >= 1;
        // Yellow → red as progress rises
        const r = 255;
        const g = full ? 60 : Math.floor(220 - lockProgress * 160);
        const b = full ? 60 : 60;
        const color = `rgb(${r},${g},${b})`;
        const size = full ? 22 : (32 - lockProgress * 12); // shrinks as it locks
        ctx.strokeStyle = color;
        ctx.lineWidth = full ? 2.5 : 1.5;
        ctx.strokeRect(screen.x - size, screen.y - size, size * 2, size * 2);

        // Acquisition progress bar above box
        if (!full) {
          ctx.fillStyle = color;
          ctx.fillRect(screen.x - size, screen.y - size - 8, size * 2 * lockProgress, 4);
          ctx.fillText('ACQ', screen.x + size + 4, screen.y - size + 4);
        } else {
          // Corner brackets to emphasize full lock
          const b2 = 8;
          ctx.beginPath();
          ctx.moveTo(screen.x - size, screen.y - size + b2); ctx.lineTo(screen.x - size, screen.y - size); ctx.lineTo(screen.x - size + b2, screen.y - size);
          ctx.moveTo(screen.x + size, screen.y - size + b2); ctx.lineTo(screen.x + size, screen.y - size); ctx.lineTo(screen.x + size - b2, screen.y - size);
          ctx.moveTo(screen.x - size, screen.y + size - b2); ctx.lineTo(screen.x - size, screen.y + size); ctx.lineTo(screen.x - size + b2, screen.y + size);
          ctx.moveTo(screen.x + size, screen.y + size - b2); ctx.lineTo(screen.x + size, screen.y + size); ctx.lineTo(screen.x + size - b2, screen.y + size);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fillText('LOCK', screen.x + size + 4, screen.y - size + 4);
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#9fffa6';
        ctx.fillStyle = '#9fffa6';
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
    const fwd = jet.forward();
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
    const pitchDeg = pitch * 180 / Math.PI;

    ctx.save();
    ctx.translate(cx, cy);
    // No bank rotation — pitch ladder stays screen-aligned (non-conformal).
    ctx.strokeStyle = 'rgba(159,255,166,0.7)';
    ctx.fillStyle = '#9fffa6';
    // Wider spacing + narrow visible band → only ~3 lines on screen at a time;
    // new lines slide in from top/bottom as the nose pitches.
    const pxPerDeg = 22;
    const halfHeight = 240;
    for (let deg = -90; deg <= 90; deg += 10) {
      const y = (pitchDeg - deg) * pxPerDeg;
      if (Math.abs(y) > halfHeight) continue;
      const len = deg === 0 ? 160 : 80;
      const isDive = deg < 0;
      // Dashed for dive lines, solid for climb/horizon.
      ctx.setLineDash(isDive ? [10, 8] : []);
      ctx.beginPath();
      ctx.moveTo(-len, y);
      ctx.lineTo(len, y);
      ctx.stroke();
      // Tick marks on inner ends pointing toward horizon (down for climb, up for dive)
      if (deg !== 0) {
        const tick = isDive ? -10 : 10;
        ctx.beginPath();
        ctx.moveTo(-len, y); ctx.lineTo(-len, y + tick);
        ctx.moveTo( len, y); ctx.lineTo( len, y + tick);
        ctx.stroke();
        ctx.fillText(`${deg}`,  len + 6, y + 4);
        ctx.fillText(`${deg}`, -len - 22, y + 4);
      }
    }
    ctx.setLineDash([]);
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
