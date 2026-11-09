/* Skywall · render.js
   A pseudo-3D road on a 2D canvas: segments projected front to back, the sky
   plate behind, cumulus puffs beside the road, then the box, the car, the
   fixation cross and the sign.

   Layout follows the study: sign above the fixation cross, car below it,
   about 1.9° of visual angle apart (≈75 CSS px at laptop distance). */
(function (SW) {
  'use strict';

  const C = SW.COLORS;
  const SEG = SW.SEG;
  const R = 4;           // road half-width, metres
  const D = 7;           // camera → car, metres
  const BOX = 1.6;       // speed band: how far the car moves fore/aft on the road, metres
  const BOX_FRONT = 2.2; // the box's front line sits this far past the car's rear axle
  const DRAW = 210;      // segments drawn (~420 m)
  const NEAR = 0.4;
  const FOG0 = 50, FOG1 = 380;

  SW.ROAD = { R, D, BOX };

  function fogAt(z) {
    if (z <= FOG0) return 0;
    const t = Math.min(1, (z - FOG0) / (FOG1 - FOG0));
    return t * t;
  }

  function layout(W, H, dpr) {
    const U = Math.min(H, W / 1.15);
    const portrait = H > W * 1.1;
    const cx = W / 2;
    const crossY = H * (portrait ? 0.47 : 0.5);
    const gap = SW.clamp(U * 0.085, 44 * dpr, 100 * dpr);   // ≈1.9°
    const carW = U * 0.19;
    const carBottom = crossY + gap + carW * 0.55;
    const horizon = crossY - U * 0.25;
    const roadHalf = carW * 1.5625;          // car half-width is 0.32 of the road's
    const fOverD = roadHalf / R;
    const camH = (carBottom - horizon) / fOverD;
    const f = D * fOverD;
    return {
      W, H, dpr, U, cx, crossY, gap, carW, carBottom, horizon, camH, f,
      signY: crossY - gap,
      signR: gap * 0.3,
      arm: gap * 0.17,
      thick: Math.max(2 * dpr, gap * 0.05)
    };
  }

  // Equal-area shapes, so shape (not size) is the cue.
  function signPath(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (shape === 'square') {
      const h = r * 0.886;
      ctx.rect(x - h, y - h, h * 2, h * 2);
    } else {
      const pr = r * 1.149;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const px = x + Math.cos(a) * pr, py = y + Math.sin(a) * pr + pr * 0.1;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }
  }

  SW.drawSign = function (ctx, kind, x, y, r) {
    const ink = Math.max(1.5, r * 0.09), halo = Math.max(1.5, r * 0.11);
    ctx.lineJoin = 'round';
    signPath(ctx, kind.shape, x, y, r);
    ctx.strokeStyle = C.cloud; ctx.lineWidth = (ink + halo) * 2; ctx.stroke();
    ctx.fillStyle = C[kind.fill]; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = ink; ctx.stroke();
  };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.plate = null;
      this.puff = null;
      this.dprMax = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = this.dprMax;
      const n = DRAW + 2;
      this.bx = new Float32Array(n);
      this.by = new Float32Array(n);
      this.bw = new Float32Array(n);
      this.bz = new Float32Array(n);
      this.resize();
    }

    load(key, src) {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => { this[key] = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    setDpr(d) {
      if (Math.abs(d - this.dpr) < 0.01) return;
      this.dpr = d;
      this.resize();
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.cv.width = Math.round(w * this.dpr);
      this.cv.height = Math.round(h * this.dpr);
      this.L = layout(this.cv.width, this.cv.height, this.dpr);
    }

    /* st: { world, car, sign, flash, shake, showBox, showCross, reduced } */
    draw(st) {
      const ctx = this.ctx, L = this.L, w = st.world, tr = w.track;
      const camS = w.carS - D;
      const camY = tr.yAt(w.carS) + L.camH;
      const carSeg = tr.at(w.carS);
      const offAt = s => (s <= w.carS ? 0 : 0.5 * carSeg.curve * (s - w.carS) * (s - w.carS));

      this.drawSky(w);

      // Project segment boundaries. The road's sideways offset is integrated
      // from the car forward, so the road under the car is always centred.
      const { bx, by, bw, bz } = this;
      const base = Math.max(0, Math.floor(camS / SEG));
      const last = tr.segs.length - 1;
      let x = 0, dx = 0;
      for (let n = 0; n <= DRAW; n++) {
        const i = base + n;
        const s = i * SEG;
        let off = 0;
        if (i === carSeg.i + 1) {
          const l = s - w.carS;
          x = 0.5 * carSeg.curve * l * l; dx = carSeg.curve * l; off = x;
        } else if (i > carSeg.i + 1) {
          const c = tr.segs[Math.min(i - 1, last)].curve;
          x += dx * SEG + 0.5 * c * SEG * SEG; dx += c * SEG; off = x;
        }
        const z = s - camS;
        bz[n] = z;
        if (z > NEAR) {
          const k = L.f / z;
          bx[n] = L.cx + off * k;
          by[n] = L.horizon + (camY - tr.segs[Math.min(i, last)].y0) * k;
          bw[n] = R * k;
        }
      }

      // Segments, near to far. maxY is the highest screen row already covered.
      let maxY = L.H;
      const puffs = [];
      for (let n = 0; n < DRAW; n++) {
        if (bz[n] <= NEAR) continue;
        const y1 = by[n], y2 = by[n + 1];
        if (y2 >= y1 || y2 >= maxY) continue;
        const i = base + n;
        const seg = tr.segs[Math.min(i, last)];
        const band = Math.floor(i / 3) % 2;
        const x1 = bx[n], w1 = bw[n], x2 = bx[n + 1], w2 = bw[n + 1];
        const clipped = y1 > maxY + 0.5;
        if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L.W, maxY); ctx.clip(); }

        // Fills reach 1px upward (toward the horizon), where the next, farther
        // segment paints over them; reaching down would leave seams.
        ctx.fillStyle = band ? C.cloud : C.haze;
        ctx.fillRect(0, y2 - 1, L.W, y1 - y2 + 1);

        ctx.fillStyle = band ? C.sky : C.haze;
        quad(ctx, x1 - w1 * 1.12, x1 - w1, y1, x2 - w2 * 1.12, x2 - w2, y2 - 0.5);
        quad(ctx, x1 + w1, x1 + w1 * 1.12, y1, x2 + w2, x2 + w2 * 1.12, y2 - 0.5);

        ctx.fillStyle = C.ink;
        quad(ctx, x1 - w1, x1 + w1, y1, x2 - w2, x2 + w2, y2 - 0.5);

        // A thin joint across the road every 6 m, for a sense of speed.
        if (i % 3 === 0 && y1 - y2 > 1.5) {
          ctx.fillStyle = C.haze;
          ctx.fillRect(x1 - w1, y1 - Math.max(1, L.dpr * 0.75), w1 * 2, Math.max(1, L.dpr * 0.75));
        }

        const fog = fogAt(bz[n]);
        if (fog > 0.01) {
          ctx.globalAlpha = fog;
          ctx.fillStyle = C.cloud;
          ctx.fillRect(0, y2 - 1, L.W, y1 - y2 + 1);
          ctx.globalAlpha = 1;
        }
        if (clipped) ctx.restore();
        if (seg.cloud) puffs.push(n, maxY);
        maxY = y2;
      }

      this.drawPuffs(puffs, tr, base);
      if (st.showBox) this.drawBox(st, camS, camY, offAt);
      this.drawCarAt(st, camS, camY, offAt);
      if (st.showCross) this.drawCross(st);
      if (st.sign) SW.drawSign(ctx, st.sign, L.cx, L.signY, L.signR);
    }

    drawSky(w) {
      const ctx = this.ctx, L = this.L, img = this.plate;
      ctx.fillStyle = C.sky;
      ctx.fillRect(0, 0, L.W, L.H);
      if (!img) return;
      const anchor = 0.7; // where the plate's cloud sea begins
      const s = Math.max(L.W / img.width, (L.horizon + L.H * 0.08) / (img.height * anchor));
      const dw = img.width * s, dh = img.height * s;
      const y0 = L.horizon - img.height * anchor * s + w.bgY * L.U;
      const period = 2 * dw;
      const x0 = -((((w.bgX * L.U) % period) + period) % period);
      for (let x = x0, k = 0; x < L.W; x += dw, k++) {
        if (x + dw < 0) continue;
        if (k % 2 === 0) {
          ctx.drawImage(img, x, y0, dw, dh);
        } else {
          ctx.save();
          ctx.translate(x + dw, y0);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, dw, dh);
          ctx.restore();
        }
      }
    }

    drawPuffs(puffs, tr, base) {
      const img = this.puff;
      if (!img) return;
      const ctx = this.ctx, L = this.L;
      const ratio = img.height / img.width;
      for (let j = puffs.length - 2; j >= 0; j -= 2) {
        const n = puffs[j], clip = puffs[j + 1];
        const c = tr.segs[base + n].cloud;
        const k = this.bw[n] / R;
        const cw = c.w * k, ch = cw * ratio;
        const cx = this.bx[n] + c.x * k;
        if (cx + cw / 2 < 0 || cx - cw / 2 > L.W) continue;
        const bottom = this.by[n] + ch * 0.22;
        const top = bottom - ch;
        if (top >= clip) continue;
        const visH = Math.min(ch, clip - top);
        ctx.globalAlpha = 1 - fogAt(this.bz[n]);
        ctx.drawImage(img, 0, 0, img.width, img.height * (visH / ch), cx - cw / 2, top, cw, visH);
      }
      ctx.globalAlpha = 1;
    }

    project(s, camS, camY, xm, offAt) {
      const L = this.L, z = s - camS, k = L.f / z;
      return { x: L.cx + (offAt(s) + xm) * k, y: L.horizon + (camY - this.trackY(s)) * k, k };
    }

    drawBox(st, camS, camY, offAt) {
      const ctx = this.ctx, L = this.L, w = st.world;
      this.trackY = s => w.track.yAt(s);
      const back = camS + D - BOX, front = camS + D + BOX + BOX_FRONT;
      const bl = this.project(back, camS, camY, -R, offAt), br = this.project(back, camS, camY, R, offAt);
      const fl = this.project(front, camS, camY, -R, offAt), fr = this.project(front, camS, camY, R, offAt);
      const thin = Math.max(2 * L.dpr, L.gap * 0.045);
      const edge = (a, b, hit) => {
        ctx.lineWidth = hit ? thin * 2.4 : thin;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };
      ctx.strokeStyle = C.cloud;
      ctx.lineCap = 'round';
      edge(bl, br, w.hitBack);
      edge(fl, fr, w.hitFront);
      edge(bl, fl, w.hitLeft);
      edge(br, fr, w.hitRight);
    }

    drawCarAt(st, camS, camY, offAt) {
      const L = this.L, w = st.world;
      this.trackY = s => w.track.yAt(s);
      const z = D + w.y * BOX;
      const p = this.project(camS + z, camS, camY, w.x * R, offAt);
      const lean = st.reduced ? 0 : w.ux * 0.03;
      SW.drawCar(this.ctx, st.car, p.x, p.y, L.carW * D / z, { lean, brake: Math.max(0, -w.uy) });
    }

    drawCross(st) {
      const ctx = this.ctx, L = this.L;
      let x = L.cx, y = L.crossY;
      const shaking = st.shake && !st.reduced;
      if (shaking) {
        x += (Math.random() - 0.5) * L.arm * 0.9;
        y += (Math.random() - 0.5) * L.arm * 0.9;
      }
      const a = L.arm, t = L.thick, o = Math.max(1, t * 0.45);
      let fill = C.cloud, outline = C.ink;
      if (st.flash) { fill = st.flash.ok ? C.sky : C.ink; outline = C.cloud; }
      ctx.save();
      ctx.translate(x, y);
      // Reduced motion: an off-road cross turns into an × instead of shaking.
      if (st.shake && st.reduced) ctx.rotate(Math.PI / 4);
      ctx.fillStyle = outline;
      ctx.fillRect(-a - o, -t / 2 - o, (a + o) * 2, t + o * 2);
      ctx.fillRect(-t / 2 - o, -a - o, t + o * 2, (a + o) * 2);
      ctx.fillStyle = fill;
      ctx.fillRect(-a, -t / 2, a * 2, t);
      ctx.fillRect(-t / 2, -a, t, a * 2);
      ctx.restore();
    }
  }

  function quad(ctx, xa, xb, y1, xc, xd, y2) {
    ctx.beginPath();
    ctx.moveTo(xa, y1); ctx.lineTo(xb, y1); ctx.lineTo(xd, y2); ctx.lineTo(xc, y2);
    ctx.closePath();
    ctx.fill();
  }

  SW.Renderer = Renderer;
})(window.SW);
