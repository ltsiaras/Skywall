/* Skywall · input.js
   Keyboard, gamepad and touch, folded into one drive stick (x, y in −1..1)
   and a queue of timestamped presses.

   Study set-up: left thumb on the stick to drive, right index finger on a
   button to answer signs. Here: arrows/WASD or the left stick (or a left-thumb
   touch stick) drive; Space, F, J, K, L, a gamepad A/RB/RT, or a tap on the
   right half answer. */
(function (SW) {
  'use strict';

  const RESPOND_KEYS = new Set(['Space', 'KeyF', 'KeyJ', 'KeyK', 'KeyL']);
  const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
  const DRIVE = {
    ArrowLeft: ['x', -1], KeyA: ['x', -1],
    ArrowRight: ['x', 1], KeyD: ['x', 1],
    ArrowUp: ['y', 1], KeyW: ['y', 1],
    ArrowDown: ['y', -1], KeyS: ['y', -1]
  };
  const PAD_RESPOND = [0, 5, 7];  // A / Cross, right bumper, right trigger
  const PAD_BACK = [1];           // B / Circle
  const PAD_PAUSE = [9];          // Start / Options
  const DEADZONE = 0.12;

  class Input {
    constructor(touchLayer) {
      this.held = new Set();
      this.kb = { x: 0, y: 0 };
      this.touch = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
      this.pad = { x: 0, y: 0, buttons: [] };
      this.x = 0; this.y = 0;
      this.events = [];          // { type: 'respond'|'pause'|'back', t, source }
      this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';
      this.onMode = null;
      this.captureKeys = false;  // true while a run is playing

      addEventListener('keydown', e => this.keydown(e));
      addEventListener('keyup', e => { if (DRIVE[e.code]) this.held.delete(e.code); });
      addEventListener('blur', () => { this.held.clear(); this.releaseTouch(); });

      this.layer = touchLayer;
      this.knob = touchLayer.querySelector('.stick-knob');
      this.ring = touchLayer.querySelector('.stick');
      touchLayer.addEventListener('pointerdown', e => this.pointerdown(e));
      touchLayer.addEventListener('pointermove', e => this.pointermove(e));
      touchLayer.addEventListener('pointerup', e => this.pointerup(e));
      touchLayer.addEventListener('pointercancel', e => this.pointerup(e));
      addEventListener('gamepadconnected', () => this.setMode('pad'));
    }

    setMode(m) {
      if (m === this.mode) return;
      this.mode = m;
      if (this.onMode) this.onMode(m);
    }

    push(type, t, source) { this.events.push({ type, t, source }); }
    take() { const e = this.events; this.events = []; return e; }

    keydown(e) {
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (typing) return;
      if (DRIVE[e.code]) {
        this.held.add(e.code);
        if (this.captureKeys) e.preventDefault();
      }
      if (!e.repeat) {
        const onButton = e.target && e.target.tagName === 'BUTTON';
        if (RESPOND_KEYS.has(e.code)) {
          // Space on a focused button should press that button, not answer.
          if (onButton && e.code === 'Space' && !this.captureKeys) return;
          e.preventDefault();
          this.push('respond', e.timeStamp || performance.now(), 'key');
        } else if (PAUSE_KEYS.has(e.code)) {
          this.push(e.code === 'Escape' ? 'back' : 'pause', performance.now(), 'key');
        }
      } else if (RESPOND_KEYS.has(e.code)) {
        e.preventDefault();
      }
      if (this.mode !== 'keys' && (DRIVE[e.code] || RESPOND_KEYS.has(e.code))) this.setMode('keys');
    }

    pointerdown(e) {
      e.preventDefault();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setMode('touch');
      const r = this.layer.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2) {
        if (this.touch.id !== null) return;
        this.touch.id = e.pointerId;
        this.touch.ox = e.clientX; this.touch.oy = e.clientY;
        this.layer.setPointerCapture && this.layer.setPointerCapture(e.pointerId);
        this.ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        this.knob.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        this.layer.classList.add('steering');
      } else {
        this.push('respond', e.timeStamp || performance.now(), 'touch');
        this.layer.classList.add('tapped');
        clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => this.layer.classList.remove('tapped'), 120);
      }
    }

    pointermove(e) {
      if (e.pointerId !== this.touch.id) return;
      const rad = Math.min(70, innerWidth * 0.12);
      let dx = e.clientX - this.touch.ox, dy = e.clientY - this.touch.oy;
      const len = Math.hypot(dx, dy);
      if (len > rad) { dx *= rad / len; dy *= rad / len; }
      this.touch.x = dx / rad;
      this.touch.y = -dy / rad;
      this.knob.style.transform = `translate(${this.touch.ox + dx}px, ${this.touch.oy + dy}px)`;
    }

    pointerup(e) {
      if (e.pointerId === this.touch.id) this.releaseTouch();
    }

    releaseTouch() {
      this.touch.id = null; this.touch.x = 0; this.touch.y = 0;
      if (this.layer) this.layer.classList.remove('steering');
    }

    pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const p of pads) if (p && p.connected) { gp = p; break; }
      if (!gp) { this.pad.x = 0; this.pad.y = 0; return; }
      let ax = gp.axes[0] || 0, ay = -(gp.axes[1] || 0);
      const mag = Math.hypot(ax, ay);
      if (mag < DEADZONE) { ax = 0; ay = 0; }
      else { const k = (mag - DEADZONE) / (1 - DEADZONE) / mag; ax *= k; ay *= k; }
      const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = 1; if (b(13)) ay = -1;
      this.pad.x = SW.clamp(ax, -1, 1); this.pad.y = SW.clamp(ay, -1, 1);
      const now = performance.now();
      const was = this.pad.buttons;
      const is = gp.buttons.map((_, i) => b(i));
      const rose = list => list.some(i => is[i] && !was[i]);
      if (rose(PAD_RESPOND)) this.push('respond', now, 'pad');
      if (rose(PAD_BACK)) this.push('back', now, 'pad');
      if (rose(PAD_PAUSE)) this.push('pause', now, 'pad');
      if (is.some(Boolean) || mag > 0.3) this.setMode('pad');
      this.pad.buttons = is;
    }

    update(dt) {
      this.pollPad();
      // Keys ramp the stick in and out, so a tap gives a partial push.
      for (const axis of ['x', 'y']) {
        let target = 0;
        for (const code of this.held) if (DRIVE[code][0] === axis) target += DRIVE[code][1];
        target = SW.clamp(target, -1, 1);
        const cur = this.kb[axis];
        const rate = target !== 0 && Math.sign(target) === Math.sign(cur || target) ? 4.5 : 9;
        const step = rate * dt;
        this.kb[axis] = Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
      }
      const tx = SW.clamp(this.kb.x + this.pad.x + this.touch.x, -1, 1);
      const ty = SW.clamp(this.kb.y + this.pad.y + this.touch.y, -1, 1);
      const a = 1 - Math.exp(-dt / 0.045);
      this.x += (tx - this.x) * a;
      this.y += (ty - this.y) * a;
    }

    reset() {
      this.held.clear(); this.kb.x = this.kb.y = 0; this.x = this.y = 0; this.releaseTouch(); this.events = [];
    }
  }

  SW.Input = Input;
})(window.SW);
