// Keyboard input → normalized control axes. Edge-triggered actions delivered as a queue.

export class Input {
  constructor() {
    this.keys = new Set();
    this.actions = [];
    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup', (e) => this._up(e));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _down(e) {
    const k = e.code;
    if (!this.keys.has(k)) {
      if (k === 'KeyR') this.actions.push('reset');
      if (k === 'KeyV') this.actions.push('toggleView');
      if (k === 'KeyF') this.actions.push('fireMissile');
    }
    this.keys.add(k);
    // Prevent page scrolling on game keys
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(k)) e.preventDefault();
  }

  _up(e) { this.keys.delete(e.code); }

  axes() {
    const k = this.keys;
    const ax = (a, b) => (k.has(a) ? 1 : 0) - (k.has(b) ? 1 : 0);
    // Standard arcade-flight layout (Ace Combat / War Thunder / GTA style):
    //   W/S        = throttle up/down
    //   A/D        = roll left/right
    //   ↑/↓        = pitch (Up = nose up — intuitive, not sim "stick forward = down")
    //   ←/→ or Q/E = yaw (rudder)
    //   Space      = guns,  F = missile,  R = reset,  V = view toggle
    return {
      pitch: ax('ArrowUp', 'ArrowDown'),
      roll:  ax('KeyD', 'KeyA'),
      yaw:   ax('ArrowRight', 'ArrowLeft') + ax('KeyE', 'KeyQ'),
      throttle: ax('KeyW', 'KeyS'),
      firingGuns: k.has('Space'),
    };
  }

  drainActions() {
    const out = this.actions;
    this.actions = [];
    return out;
  }
}
