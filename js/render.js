/* Skywall · render.js
   A pseudo-3D road on a 2D canvas: segments projected front to back over
   the sky plate and the far hills, trees and bushes in the fields, then the
   box, the car, the fixation cross and the sign.

   Layout follows the study: sign above the fixation cross, car below it,
   about 1.9° of visual angle apart (≈75 CSS px at laptop distance). */
(function (SW) {
  'use strict';

  const C = SW.COLORS;
  const S = SW.SCENE;
  const SEG = SW.SEG;
  const R = 4;           // road half-width, metres
  const D = 7;           // camera → car, metres
  const BOX = 1.6;       // speed band: how far the car moves fore/aft on the road, metres
  const BOX_FRONT = 2.2; // the box's front line sits this far past the car's rear axle
  const DRAW = 210;      // segments drawn (~420 m)
  const NEAR = 0.4;
  const FOG0 = 50, FOG1 = 380;
  const VERGE = 1.2;                 // gravel verge, as a multiple of the road's half-width
  const LINE0 = 0.9, LINE1 = 0.96;   // painted edge line, inside the road edge

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

  // A solid sign in the study's colour, with a thin light rim so it reads on
  // the dark road and on the clouds alike.
  SW.drawSign = function (ctx, kind, x, y, r) {
    const rim = Math.max(1.5, r * 0.1);
    ctx.lineJoin = 'round';
    signPath(ctx, kind.shape, x, y, r);
    ctx.strokeStyle = C.cloud; ctx.lineWidth = rim * 2; ctx.stroke();
    ctx.fillStyle = SW.STIM[kind.fill]; ctx.fill();
  };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.plate = null;
      this.sprites = SW.buildSprites();
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
      this.drawLand(w);

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
      const props = [];
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
        // Mown stripes in the fields, gravel verges, then the road with its
        // two painted edge lines; bands alternate every 6 m for speed.
        ctx.fillStyle = S.grass[band];
        ctx.fillRect(0, y2 - 1, L.W, y1 - y2 + 1);

        ctx.fillStyle = S.shoulder[band];
        quad(ctx, x1 - w1 * VERGE, x1 + w1 * VERGE, y1, x2 - w2 * VERGE, x2 + w2 * VERGE, y2 - 0.5);

        ctx.fillStyle = S.road[band];
        quad(ctx, x1 - w1, x1 + w1, y1, x2 - w2, x2 + w2, y2 - 0.5);

        if (w1 > 6) {
          ctx.fillStyle = S.line;
          quad(ctx, x1 - w1 * LINE1, x1 - w1 * LINE0, y1, x2 - w2 * LINE1, x2 - w2 * LINE0, y2 - 0.5);
          quad(ctx, x1 + w1 * LINE0, x1 + w1 * LINE1, y1, x2 + w2 * LINE0, x2 + w2 * LINE1, y2 - 0.5);
        }

        const fog = fogAt(bz[n]);
        if (fog > 0.01) {
          ctx.globalAlpha = fog;
          ctx.fillStyle = S.haze;
          ctx.fillRect(0, y2 - 1, L.W, y1 - y2 + 1);
          ctx.globalAlpha = 1;
        }
        if (clipped) ctx.restore();
        if (seg.prop) props.push(n, maxY);
        maxY = y2;
      }

      this.drawProps(props, tr, base);
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
      const x0 = -((((w.bgX * L.U * 0.6) % period) + period) % period);
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

    drawLand(w) {
      SW.drawHills(this.ctx, this.L, this.L.horizon + w.bgY * this.L.U, w.bgX);
    }

    // Far to near, each clipped to what nearer ground hasn't already covered.
    drawProps(props, tr, base) {
      const ctx = this.ctx, L = this.L;
      for (let j = props.length - 2; j >= 0; j -= 2) {
        const n = props[j], clip = props[j + 1];
        const p = tr.segs[base + n].prop;
        const img = this.sprites[p.kind][p.v][p.flip];
        const k = this.bw[n] / R;
        const ph = p.h * k, pw = ph * img.width / img.height;
        const cx = this.bx[n] + p.x * k;
        if (cx + pw / 2 < 0 || cx - pw / 2 > L.W || ph < 1.5) continue;
        const bottom = this.by[n] + ph * 0.02;
        const top = bottom - ph;
        if (top >= clip) continue;
        const visH = Math.min(ph, clip - top);
        ctx.globalAlpha = 1 - 0.85 * fogAt(this.bz[n]);
        ctx.drawImage(img, 0, 0, img.width, img.height * (visH / ph), cx - pw / 2, top, pw, visH);
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
      // The study's box: yellow road boundaries, red speed boundaries.
      ctx.lineCap = 'round';
      ctx.strokeStyle = SW.STIM.yellow;
      edge(bl, fl, w.hitLeft);
      edge(br, fr, w.hitRight);
      ctx.strokeStyle = SW.STIM.red;
      edge(bl, br, w.hitBack);
      edge(fl, fr, w.hitFront);
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
      if (st.flash) fill = st.flash.ok ? SW.STIM.green : SW.STIM.red;
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
