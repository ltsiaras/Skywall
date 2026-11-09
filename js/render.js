/* render.js - pseudo 3D road on a 2D canvas.
   Draw order: sky, hills, road segments (near to far, clipped), trees,
   box, car, cross, sign. Canvas is a fixed 4:3 window at 1x resolution
   (portrait phones get the whole screen). */
(function (SW) {
  'use strict';

  var S = SW.SCENE;
  var SEG = SW.SEG;
  var R = 4;           // road half width (m)
  var D = 7;           // camera to car (m)
  var BOX = 1.6;       // how far the car moves fore/aft (m)
  var BOX_FRONT = 2.2; // front line of the box past the car (m)
  var DRAW = 160;      // segments to draw
  var NEAR = 0.4;
  var KERB = 1.12;     // kerb outer edge, x road half width

  SW.ROAD = { R: R, D: D, BOX: BOX };

  function layout(W, H) {
    var U = Math.min(H, W / 1.15);
    var portrait = H > W * 1.1;
    var cx = W / 2;
    var crossY = H * (portrait ? 0.47 : 0.5);
    var gap = SW.clamp(U * 0.085, 44, 100);   // sign/car distance from cross, about 1.9 deg
    var carW = U * 0.19;
    var carBottom = crossY + gap + carW * 0.55;
    var horizon = crossY - U * 0.25;
    var roadHalf = carW * 1.5625;
    var fOverD = roadHalf / R;
    var camH = (carBottom - horizon) / fOverD;
    var f = D * fOverD;
    return {
      W: W, H: H, U: U, cx: cx, crossY: crossY, gap: gap, carW: carW, carBottom: carBottom,
      horizon: horizon, camH: camH, f: f,
      signY: crossY - gap,
      signR: gap * 0.3,
      arm: gap * 0.17,
      thick: Math.max(2, Math.round(gap * 0.05))
    };
  }

  // same area for every shape so only the shape differs
  function signPath(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (shape === 'square') {
      var h = r * 0.886;
      ctx.rect(x - h, y - h, h * 2, h * 2);
    } else {
      var pr = r * 1.149;
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        var px = x + Math.cos(a) * pr, py = y + Math.sin(a) * pr + pr * 0.1;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }
  }

  SW.drawSign = function (ctx, kind, x, y, r) {
    signPath(ctx, kind.shape, x, y, r);
    ctx.fillStyle = SW.STIM[kind.fill];
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.strokeStyle = '#000';
    ctx.stroke();
  };

  function quad(ctx, xa, xb, y1, xc, xd, y2) {
    ctx.beginPath();
    ctx.moveTo(xa, y1); ctx.lineTo(xb, y1); ctx.lineTo(xd, y2); ctx.lineTo(xc, y2);
    ctx.closePath();
    ctx.fill();
  }

  function Renderer(canvas) {
    this.cv = canvas;
    this.frame = canvas.parentNode;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.bx = new Float32Array(DRAW + 2);
    this.by = new Float32Array(DRAW + 2);
    this.bw = new Float32Array(DRAW + 2);
    this.bz = new Float32Array(DRAW + 2);
    this.resize();
  }

  Renderer.prototype.resize = function () {
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = vw, h = vh;
    if (vw > vh * 1.1) {             // landscape: 4:3 window with black bars
      w = Math.min(vw, Math.round(vh * 4 / 3));
      h = Math.min(vh, Math.round(w * 3 / 4));
    }
    var fs = this.frame.style;
    fs.width = w + 'px';
    fs.height = h + 'px';
    fs.left = Math.floor((vw - w) / 2) + 'px';
    fs.top = Math.floor((vh - h) / 2) + 'px';
    this.cv.width = w;
    this.cv.height = h;
    this.L = layout(w, h);
  };

  /* st = { world, car, sign, flash, shake, showBox, showCross, reduced } */
  Renderer.prototype.draw = function (st) {
    var ctx = this.ctx, L = this.L, w = st.world, tr = w.track;
    var camS = w.carS - D;
    var camY = tr.yAt(w.carS) + L.camH;
    var carSeg = tr.at(w.carS);
    var offAt = function (s) { return s <= w.carS ? 0 : 0.5 * carSeg.curve * (s - w.carS) * (s - w.carS); };
    var bx = this.bx, by = this.by, bw = this.bw, bz = this.bz;

    SW.drawSky(ctx, L, w.bgX);
    SW.drawHills(ctx, L, L.horizon + w.bgY * L.U, w.bgX);

    // project segment edges. road under the car is always centred.
    var base = Math.max(0, Math.floor(camS / SEG));
    var last = tr.segs.length - 1;
    var x = 0, dx = 0, n, i;
    for (n = 0; n <= DRAW; n++) {
      i = base + n;
      var s = i * SEG, off = 0;
      if (i === carSeg.i + 1) {
        var l = s - w.carS;
        x = 0.5 * carSeg.curve * l * l; dx = carSeg.curve * l; off = x;
      } else if (i > carSeg.i + 1) {
        var c = tr.segs[Math.min(i - 1, last)].curve;
        x += dx * SEG + 0.5 * c * SEG * SEG; dx += c * SEG; off = x;
      }
      var z = s - camS;
      bz[n] = z;
      if (z > NEAR) {
        var k = L.f / z;
        bx[n] = L.cx + off * k;
        by[n] = L.horizon + (camY - tr.segs[Math.min(i, last)].y0) * k;
        bw[n] = R * k;
      }
    }

    // segments near to far. maxY = top of what's already drawn.
    var maxY = L.H;
    var props = [];
    for (n = 0; n < DRAW; n++) {
      if (bz[n] <= NEAR) continue;
      var y1 = by[n], y2 = by[n + 1];
      if (y2 >= y1 || y2 >= maxY) continue;
      i = base + n;
      var seg = tr.segs[Math.min(i, last)];
      var band = Math.floor(i / 3) % 2;
      var x1 = bx[n], w1 = bw[n], x2 = bx[n + 1], w2 = bw[n + 1];
      var clipped = y1 > maxY + 0.5;
      if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L.W, maxY); ctx.clip(); }

      ctx.fillStyle = S.grass[band];
      ctx.fillRect(0, y2 - 1, L.W, y1 - y2 + 1);
      ctx.fillStyle = S.rumble[band];
      quad(ctx, x1 - w1 * KERB, x1 + w1 * KERB, y1, x2 - w2 * KERB, x2 + w2 * KERB, y2 - 0.5);
      ctx.fillStyle = S.road[band];
      quad(ctx, x1 - w1, x1 + w1, y1, x2 - w2, x2 + w2, y2 - 0.5);

      if (clipped) ctx.restore();
      if (seg.prop) props.push(n, maxY);
      maxY = y2;
    }

    // trees far to near, cut off where nearer ground already covers them
    for (var j = props.length - 2; j >= 0; j -= 2) {
      n = props[j];
      var clip = props[j + 1];
      var p = tr.segs[base + n].prop;
      var kk = bw[n] / R;
      var px = bx[n] + p.x * kk;
      var top = by[n] - p.h * kk;
      if (p.h * kk < 2 || top >= clip || px < -p.h * kk || px > L.W + p.h * kk) continue;
      if (by[n] > clip) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L.W, clip); ctx.clip(); }
      SW.drawProp(ctx, p, px, by[n], kk);
      if (by[n] > clip) ctx.restore();
    }

    this.trackY = function (s) { return tr.yAt(s); };
    if (st.showBox) this.drawBox(w, camS, camY, offAt);
    this.drawCar(st, camS, camY, offAt);
    if (st.showCross) this.drawCross(st);
    if (st.sign) SW.drawSign(ctx, st.sign, L.cx, L.signY, L.signR);
  };

  Renderer.prototype.project = function (s, camS, camY, xm, offAt) {
    var L = this.L, k = L.f / (s - camS);
    return { x: L.cx + (offAt(s) + xm) * k, y: L.horizon + (camY - this.trackY(s)) * k };
  };

  // the box: yellow = road edges, red = speed limits. thicker when you hit it.
  Renderer.prototype.drawBox = function (w, camS, camY, offAt) {
    var ctx = this.ctx;
    var back = camS + D - BOX, front = camS + D + BOX + BOX_FRONT;
    var bl = this.project(back, camS, camY, -R, offAt), br = this.project(back, camS, camY, R, offAt);
    var fl = this.project(front, camS, camY, -R, offAt), fr = this.project(front, camS, camY, R, offAt);
    function line(a, b, color, hit) {
      ctx.strokeStyle = color;
      ctx.lineWidth = hit ? 6 : 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    line(bl, fl, SW.STIM.yellow, w.hitLeft);
    line(br, fr, SW.STIM.yellow, w.hitRight);
    line(bl, br, SW.STIM.red, w.hitBack);
    line(fl, fr, SW.STIM.red, w.hitFront);
  };

  Renderer.prototype.drawCar = function (st, camS, camY, offAt) {
    var w = st.world;
    var z = D + w.y * BOX;
    var p = this.project(camS + z, camS, camY, w.x * R, offAt);
    var lean = st.reduced ? 0 : w.ux * 0.03;
    SW.drawCar(this.ctx, st.car, p.x, p.y, this.L.carW * D / z, { lean: lean, brake: Math.max(0, -w.uy) });
  };

  Renderer.prototype.drawCross = function (st) {
    var ctx = this.ctx, L = this.L;
    var x = L.cx, y = L.crossY;
    if (st.shake && !st.reduced) {
      x += (Math.random() - 0.5) * L.arm;
      y += (Math.random() - 0.5) * L.arm;
    }
    var a = L.arm, t = L.thick;
    var fill = '#FFFFFF';
    if (st.flash) fill = st.flash.ok ? SW.STIM.green : SW.STIM.red;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (st.shake && st.reduced) ctx.rotate(Math.PI / 4);   // reduced motion: x instead of shaking
    ctx.fillStyle = '#000';
    ctx.fillRect(-a - 1, -t / 2 - 1, a * 2 + 2, t + 2);
    ctx.fillRect(-t / 2 - 1, -a - 1, t + 2, a * 2 + 2);
    ctx.fillStyle = fill;
    ctx.fillRect(-a, -t / 2, a * 2, t);
    ctx.fillRect(-t / 2, -a, t, a * 2);
    ctx.restore();
  };

  SW.Renderer = Renderer;
})(window.SW);
