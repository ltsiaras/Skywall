/* Skywall · scenery.js
   The daytime countryside the road runs through: the scene's own palette,
   two bands of far hills, and roadside trees and bushes drawn once into
   offscreen canvases. The site's four colours stay on the UI, the car and
   the cross; the land gets these. */
(function (SW) {
  'use strict';

  SW.SCENE = {
    grass: ['#5DAA5E', '#55A157'],
    shoulder: ['#DCD3BC', '#CFC5AB'],   // pale gravel verge
    road: ['#636B75', '#5E666F'],
    line: '#F6F4EE',                    // painted edge lines
    haze: '#A7CBAE',                    // aerial haze: far fields, fog
    hillFar: '#A6CBBB',
    hillNear: '#7FB687',
    leaf: ['#3F8B48', '#367F40', '#4C9752'],
    leafHi: '#7CBF74',
    leafLo: '#245C30',
    trunk: '#6E5640'
  };
  const S = SW.SCENE;

  /* Prop kinds. h is the height range in metres; aspect is width / height. */
  SW.PROPS = {
    oak:    { h: [5.5, 9],  aspect: 0.9 },
    poplar: { h: [8, 12],   aspect: 0.42 },
    bush:   { h: [1.4, 2.4], aspect: 1.7 }
  };

  function blobs(ctx, list) {
    ctx.beginPath();
    for (const [x, y, r] of list) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
  }

  // A flat canopy with a lit top-left, a shaded underside and a soft ground shadow.
  function canopy(ctx, W, H, list, leaf, groundY, groundW) {
    ctx.fillStyle = S.leafLo;
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.ellipse(W / 2, groundY, groundW, H * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = leaf;
    blobs(ctx, list); ctx.fill();
    ctx.save();
    blobs(ctx, list); ctx.clip();
    const top = Math.min(...list.map(b => b[1] - b[2]));
    const bottom = Math.max(...list.map(b => b[1] + b[2]));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = S.leafHi;
    blobs(ctx, list.map(([x, y, r]) => [x - r * 0.28, y - r * 0.32, r * 0.62])); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = S.leafLo;
    ctx.fillRect(0, top + (bottom - top) * 0.72, W, H);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function trunk(ctx, x, y0, y1, w) {
    ctx.fillStyle = S.trunk;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.6, y1); ctx.lineTo(x - w * 0.4, y0); ctx.lineTo(x + w * 0.4, y0); ctx.lineTo(x + w * 0.6, y1);
    ctx.closePath(); ctx.fill();
  }

  const DRAWERS = {
    oak(ctx, W, H, leaf) {
      const g = H * 0.97;
      trunk(ctx, W / 2, H * 0.5, g, W * 0.1);
      canopy(ctx, W, H, [
        [W * 0.5, H * 0.34, W * 0.3], [W * 0.27, H * 0.46, W * 0.22], [W * 0.73, H * 0.46, W * 0.22],
        [W * 0.4, H * 0.2, W * 0.2], [W * 0.62, H * 0.22, W * 0.19], [W * 0.5, H * 0.55, W * 0.2]
      ], leaf, g, W * 0.36);
    },
    poplar(ctx, W, H, leaf) {
      const g = H * 0.98;
      trunk(ctx, W / 2, H * 0.7, g, W * 0.12);
      const list = [];
      for (let i = 0; i < 7; i++) {
        const t = i / 6, r = W * (0.2 + 0.24 * Math.sin(Math.PI * (0.15 + 0.75 * t)));
        list.push([W * (0.5 + (i % 2 ? 0.05 : -0.05)), H * (0.1 + t * 0.66), r]);
      }
      canopy(ctx, W, H, list, leaf, g, W * 0.42);
    },
    bush(ctx, W, H, leaf) {
      const g = H * 0.94;
      canopy(ctx, W, H, [
        [W * 0.3, H * 0.62, H * 0.3], [W * 0.52, H * 0.46, H * 0.4], [W * 0.73, H * 0.6, H * 0.32],
        [W * 0.42, H * 0.7, H * 0.24], [W * 0.62, H * 0.72, H * 0.22]
      ], leaf, g, W * 0.44);
    }
  };

  /* sprites[kind][variant][flip] → canvas */
  SW.buildSprites = function () {
    const out = {};
    for (const kind of Object.keys(DRAWERS)) {
      const H = 256, W = Math.round(H * SW.PROPS[kind].aspect);
      out[kind] = S.leaf.map(leaf => {
        const a = document.createElement('canvas');
        a.width = W; a.height = H;
        DRAWERS[kind](a.getContext('2d'), W, H, leaf);
        const b = document.createElement('canvas');
        b.width = W; b.height = H;
        const bx = b.getContext('2d');
        bx.translate(W, 0); bx.scale(-1, 1); bx.drawImage(a, 0, 0);
        return [a, b];
      });
    }
    return out;
  };

  /* Two bands of rolling hills on the horizon. `scroll` is in units of U. */
  function ridge(ctx, L, base, scroll, amp, lift, seed, color) {
    const steps = 72, dx = L.W / steps;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, L.H);
    for (let i = 0; i <= steps; i++) {
      const x = i * dx, u = x / L.U + scroll;
      const f = 0.5 + 0.26 * Math.sin(u * 2.3 + seed) + 0.16 * Math.sin(u * 5.1 + seed * 2.7) + 0.06 * Math.sin(u * 12.9 + seed * 5.3);
      ctx.lineTo(x, base - L.U * (lift + amp * f));
    }
    ctx.lineTo(L.W, L.H);
    ctx.closePath();
    ctx.fill();
  }

  SW.drawHills = function (ctx, L, base, scroll) {
    ridge(ctx, L, base, scroll * 0.85, 0.08, 0.008, 1.3, S.hillFar);
    ridge(ctx, L, base, scroll * 1.1, 0.045, 0.002, 4.1, S.hillNear);
    ctx.fillStyle = S.haze;
    ctx.fillRect(0, base - 1, L.W, L.H - base + 1);
  };
})(window.SW);
