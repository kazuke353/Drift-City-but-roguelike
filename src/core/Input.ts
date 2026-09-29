export type Action =
  | 'throttle' | 'brake' | 'left' | 'right'
  | 'handbrake' | 'boost' | 'fireMain' | 'fireSide'
  | 'gadget' | 'reload' | 'interact' | 'stash' | 'salvage'
  | 'horn' | 'loadout' | 'map' | 'pause' | 'lookBack'
  | 'choice1' | 'choice2' | 'choice3' | 'reroll';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['throttle'], ArrowUp: ['throttle'],
  KeyS: ['brake'], ArrowDown: ['brake'],
  KeyA: ['left'], ArrowLeft: ['left'],
  KeyD: ['right'], ArrowRight: ['right'],
  Space: ['handbrake'],
  ShiftLeft: ['boost'], ShiftRight: ['boost'],
  KeyQ: ['gadget'],
  KeyR: ['reload'],
  KeyT: ['reroll'],
  KeyE: ['interact'],
  KeyF: ['stash'],
  KeyX: ['salvage'],
  KeyH: ['horn'],
  Tab: ['loadout'], KeyI: ['loadout'],
  KeyM: ['map'],
  Escape: ['pause'], KeyP: ['pause'],
  KeyC: ['lookBack'],
  Digit1: ['choice1'], Digit2: ['choice2'], Digit3: ['choice3'],
  Numpad1: ['choice1'], Numpad2: ['choice2'], Numpad3: ['choice3'],
};

/** Unified keyboard / mouse / gamepad input with edge detection. */
export class Input {
  private down = new Set<Action>();
  private pressedSet = new Set<Action>();
  private keysDown = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseX = 0;
  mouseY = 0;
  wheel = 0;
  mouseButtons = [false, false, false];
  pointerLocked = false;
  pointerLockFailed = false;
  lastDevice: 'kbm' | 'pad' = 'kbm';
  /** Analog values, filled from gamepad or keyboard. */
  steerAxis = 0;
  throttleAxis = 0;
  lookX = 0;
  lookY = 0;
  private padPrev: boolean[] = [];
  enabled = true;
  onPointerLockChange: ((locked: boolean) => void) | null = null;
  sensitivity = 1;
  invertY = false;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.lastDevice = 'kbm';
      this.keysDown.add(e.code);
      const acts = KEYMAP[e.code];
      if (acts) for (const a of acts) this.setAction(a, true);
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      const acts = KEYMAP[e.code];
      if (acts) for (const a of acts) this.recomputeKeyAction(a);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.down.clear();
      this.mouseButtons = [false, false, false];
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.pointerLocked) {
        // Clamp spikes some browsers emit on lock
        const mx = Math.max(-300, Math.min(300, e.movementX));
        const my = Math.max(-300, Math.min(300, e.movementY));
        this.mouseDX += mx;
        this.mouseDY += my;
      }
      this.lastDevice = 'kbm';
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
      if (e.button === 0) this.setAction('fireMain', true);
      if (e.button === 2) this.setAction('fireSide', true);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
      if (e.button === 0) this.down.delete('fireMain');
      if (e.button === 2) this.down.delete('fireSide');
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.onPointerLockChange?.(this.pointerLocked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLockFailed = true;
      this.pointerLocked = false;
    });
  }

  requestPointerLock() {
    if (this.pointerLocked || this.pointerLockFailed) return;
    try {
      const p = (this.canvas as any).requestPointerLock?.({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') p.catch(() => {
        // retry without options (Safari / older Chrome)
        try {
          const p2 = (this.canvas as any).requestPointerLock?.();
          if (p2 && typeof p2.catch === 'function') p2.catch(() => (this.pointerLockFailed = true));
        } catch {
          this.pointerLockFailed = true;
        }
      });
    } catch {
      this.pointerLockFailed = true;
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private setAction(a: Action, v: boolean) {
    if (v) {
      if (!this.down.has(a)) this.pressedSet.add(a);
      this.down.add(a);
    } else this.down.delete(a);
  }

  private recomputeKeyAction(a: Action) {
    for (const code of this.keysDown) {
      if (KEYMAP[code]?.includes(a)) return;
    }
    if (a === 'fireMain' && this.mouseButtons[0]) return;
    if (a === 'fireSide' && this.mouseButtons[2]) return;
    this.down.delete(a);
  }

  isDown(a: Action) {
    return this.enabled && this.down.has(a);
  }
  pressed(a: Action) {
    return this.enabled && this.pressedSet.has(a);
  }
  consume(a: Action) {
    const p = this.pressedSet.has(a);
    this.pressedSet.delete(a);
    return p;
  }

  /** Poll gamepads; call once per frame before gameplay reads input. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    let steer = (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight') ? 1 : 0) -
      (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft') ? 1 : 0);
    let thr = (this.down.has('throttle') ? 1 : 0) - (this.down.has('brake') ? 1 : 0);
    this.lookX = 0;
    this.lookY = 0;
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
      const b = (i: number) => !!pad!.buttons[i]?.pressed;
      const val = (i: number) => pad!.buttons[i]?.value ?? 0;
      const any = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.05 || pad.buttons.some((x) => x.pressed);
      if (any) this.lastDevice = 'pad';
      if (Math.abs(lx) > 0) steer = lx;
      if (Math.abs(ly) > 0.2) thr = -ly;
      this.lookX = rx;
      this.lookY = ry;
      const map: [number, Action][] = [
        [0, 'handbrake'], [1, 'reload'], [2, 'interact'], [3, 'gadget'],
        [4, 'horn'], [5, 'boost'], [9, 'pause'], [8, 'loadout'], [12, 'map'],
        [10, 'boost'], [11, 'lookBack'], [14, 'choice1'], [13, 'choice2'], [15, 'choice3'],
      ];
      for (let i = 0; i < map.length; i++) {
        const [idx, act] = map[i];
        const now = b(idx);
        const key = idx * 100 + i;
        const prev = !!this.padPrev[key];
        if (now && !prev) this.setAction(act, true);
        if (!now && prev) this.recomputeKeyAction(act);
        this.padPrev[key] = now;
      }
      const rt = val(7) > 0.3, lt = val(6) > 0.3;
      if (rt !== !!this.padPrev[700]) { rt ? this.setAction('fireMain', true) : this.recomputeKeyAction('fireMain'); }
      if (lt !== !!this.padPrev[600]) { lt ? this.setAction('fireSide', true) : this.recomputeKeyAction('fireSide'); }
      this.padPrev[700] = rt;
      this.padPrev[600] = lt;
    }
    this.steerAxis = steer;
    this.throttleAxis = thr;
  }

  /** Clear per-frame state; call at end of frame. */
  endFrame() {
    this.pressedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  releaseAll() {
    this.down.clear();
    this.keysDown.clear();
    this.mouseButtons = [false, false, false];
  }
}
