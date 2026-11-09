/* scenery.js - sky, sun, hills, trees. All flat colours and canvas primitives. */
(function (SW) {
  'use strict';

  SW.SCENE = {
    skyTop: '#2F80D8',
    skyLow: '#B4DCF7',
    sun: '#FFF3B0',
    cloud: '#FFFFFF',
    cloudShade: '#DCEBF7',
    farHills: '#8FB5C9',
    hills: '#3C8C40',
    haze: '#C4E1EE',
    grass: ['#5BB548', '#52A840'],
    rumble: ['#FFFFFF', '#3A3A3A'],
    road: ['#7A7A7A', '#737373'],
    trunk: '#7A5230',
    leaf: ['#2E8B2E', '#267A26', '#3A9A34'],
    leafHi: 'rgba(255,255,255,0.18)',
    shadow: 'rgba(0,0,0,0.22)',
    outline: '#000000'
  };
  var S = SW.SCENE;

  // tree sizes in metres (h = height range)
  SW.PROPS = {
    oak:  { h: [5, 8] },
    pine: { h: [7, 11] },
    bush: { h: [1.2, 2.2] }
  };

  function wrap(u, span) { return (u % span + span) % span; }

  // a few clouds, positions in "sky units" (x in screen heights, y 0..1 above horizon)
  var CLOUDS = [
    [0.1, 0.55, 1.0], [0.9, 0.75, 0.7], [1.6, 0.45, 1.2], [2.4, 0.7, 0.8], [3.1, 0.5, 1.0]
  ];
  var SPAN = 3.6;

  function puff(ctx, x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, s * 1.6, s * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 1.1, y + s * 0.2, s, s * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 1.2, y + s * 0.25, s * 1.1, s * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.2, y - s * 0.45, s * 0.9, s * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // time = seconds, so the clouds drift on their own (0 = still)
  SW.drawSky = function (ctx, L, scroll, time) {
    var g = ctx.createLinearGradient(0, 0, 0, L.horizon);
    g.addColorStop(0, S.skyTop);
    g.addColorStop(1, S.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);

    // sun with two cheap halo rings
    var sx = (wrap(0.75 - scroll * 0.15, 3) - 0.2) * L.H, sy = L.horizon * 0.28, sr = L.H * 0.045;
    ctx.fillStyle = S.sun;
    ctx.globalAlpha = 0.15;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();

    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var x = (wrap(c[0] - scroll * 0.3 + time * 0.004, SPAN) - 0.4) * L.H;
      var y = L.horizon - c[1] * L.horizon * 0.8;
      var s = c[2] * L.H * 0.05;
      ctx.fillStyle = S.cloudShade;           // flat underside
      puff(ctx, x + s * 0.15, y + s * 0.18, s);
      ctx.fillStyle = S.cloud;
      puff(ctx, x, y, s);
    }
  };

  // hills = rows of big ellipses sitting on the horizon. far row is bluer.
  var FAR = [[0.2, 0.5, 0.12], [0.9, 0.42, 0.15], [1.5, 0.55, 0.1], [2.2, 0.45, 0.13]];
  var HILLS = [[0, 0.32, 0.07], [0.45, 0.25, 0.1], [0.8, 0.4, 0.06], [1.3, 0.3, 0.09], [1.7, 0.22, 0.05], [2.1, 0.35, 0.08]];

  function row(ctx, L, base, scroll, list, span, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      var x = (wrap(h[0] - scroll, span) - 0.3) * L.H;
      ctx.beginPath();
      ctx.ellipse(x, base, h[1] * L.H, h[2] * L.H, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  SW.drawHills = function (ctx, L, base, scroll) {
    row(ctx, L, base, scroll * 0.6, FAR, 2.8, S.farHills);
    row(ctx, L, base, scroll, HILLS, 2.4, S.hills);
    // haze where the hills meet the ground
    var g = ctx.createLinearGradient(0, base - L.H * 0.04, 0, base);
    g.addColorStop(0, 'rgba(196,225,238,0)');
    g.addColorStop(1, 'rgba(196,225,238,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, base - L.H * 0.04, L.W, L.H * 0.04);
    // flat ground under everything, in case the road dips below the horizon
    ctx.fillStyle = S.haze;
    ctx.fillRect(0, base, L.W, L.H - base);
  };

  // x = centre, y = ground, k = pixels per metre
  SW.drawProp = function (ctx, p, x, y, k) {
    var h = p.h * k;
    var lw = Math.max(1, k * 0.08);
    ctx.lineWidth = lw;
    ctx.strokeStyle = S.outline;

    ctx.fillStyle = S.shadow;
    ctx.beginPath();
    ctx.ellipse(x + h * 0.08, y, h * (p.kind === 'bush' ? 1.2 : 0.4), h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.kind === 'bush') {
      ctx.fillStyle = S.leaf[p.v];
      ctx.beginPath();
      ctx.ellipse(x, y, h * 1.1, h, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = S.leafHi;
      ctx.beginPath();
      ctx.ellipse(x - h * 0.3, y - h * 0.55, h * 0.4, h * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    var tw = h * 0.1;
    ctx.fillStyle = S.trunk;
    ctx.fillRect(x - tw / 2, y - h * 0.45, tw, h * 0.45);
    ctx.strokeRect(x - tw / 2, y - h * 0.45, tw, h * 0.45);
    ctx.fillStyle = S.leaf[p.v];
    ctx.beginPath();
    if (p.kind === 'pine') {
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h * 0.24, y - h * 0.25);
      ctx.lineTo(x - h * 0.24, y - h * 0.25);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = S.leafHi;                 // lit left side
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x, y - h * 0.25);
      ctx.lineTo(x - h * 0.24, y - h * 0.25);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.arc(x, y - h * 0.65, h * 0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = S.leafHi;
      ctx.beginPath();
      ctx.arc(x - h * 0.1, y - h * 0.75, h * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  };
})(window.SW);
