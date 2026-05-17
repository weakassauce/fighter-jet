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
    // Prevent scroll on space
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  }

  _up(e) { this.keys.delete(e.code); }

  axes() {
    const k = this.keys;
    const ax = (a, b) => (k.has(a) ? 1 : 0) - (k.has(b) ? 1 : 0);
    return {
      // S = nose up (pull stick back), W = nose down (push stick forward) — sim convention
      pitch: ax('KeyS', 'KeyW'),
      // A = roll left, D = roll right
      roll:  ax('KeyD', 'KeyA'),
      // Q = yaw left, E = yaw right
      yaw:   ax('KeyE', 'KeyQ'),
      throttle: ax('ShiftLeft', 'ControlLeft') + ax('ShiftRight', 'ControlRight'),
      firingGuns: k.has('Space'),
    };
  }

  drainActions() {
    const out = this.actions;
    this.actions = [];
    return out;
  }
}
