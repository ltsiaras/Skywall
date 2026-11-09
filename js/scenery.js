/* scenery.js - sky, hills, trees. All flat colours and canvas primitives. */
(function (SW) {
  'use strict';

  SW.SCENE = {
    skyTop: '#2F80D8',
    skyLow: '#B4DCF7',
    cloud: '#FFFFFF',
    hills: '#3C8C40',
    grass: ['#5BB548', '#52A840'],
    rumble: ['#FFFFFF', '#3A3A3A'],
    road: ['#7A7A7A', '#737373'],
    trunk: '#7A5230',
    leaf: ['#2E8B2E', '#267A26', '#3A9A34'],
    outline: '#000000'
  };
  var S = SW.SCENE;

  // tree sizes in metres (h = height range)
  SW.PROPS = {
    oak:  { h: [5, 8] },
    pine: { h: [7, 11] },
    bush: { h: [1.2, 2.2] }
  };

  // a few clouds, positions in "sky units" (x in screen heights, y 0..1 above horizon)
  var CLOUDS = [
    [0.1, 0.55, 1.0], [0.9, 0.75, 0.7], [1.6, 0.45, 1.2], [2.4, 0.7, 0.8], [3.1, 0.5, 1.0]
  ];
  var SPAN = 3.6;

  SW.drawSky = function (ctx, L, scroll) {
    var g = ctx.createLinearGradient(0, 0, 0, L.horizon);
    g.addColorStop(0, S.skyTop);
    g.addColorStop(1, S.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);

    ctx.fillStyle = S.cloud;
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var u = ((c[0] - scroll * 0.3) % SPAN + SPAN) % SPAN;   // wrap around
      var x = (u - 0.4) * L.H;
      var y = L.horizon - c[1] * L.horizon * 0.8;
      var s = c[2] * L.H * 0.05;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.6, s * 0.7, 0, 0, Math.PI * 2);
      ctx.ellipse(x - s * 1.1, y + s * 0.2, s, s * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 1.2, y + s * 0.25, s * 1.1, s * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 0.2, y - s * 0.45, s * 0.9, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // hills = a row of big ellipses sitting on the horizon
  var HILLS = [[0, 0.32, 0.07], [0.45, 0.25, 0.1], [0.8, 0.4, 0.06], [1.3, 0.3, 0.09], [1.7, 0.22, 0.05], [2.1, 0.35, 0.08]];
  var HSPAN = 2.4;

  SW.drawHills = function (ctx, L, base, scroll) {
    ctx.fillStyle = S.hills;
    for (var i = 0; i < HILLS.length; i++) {
      var h = HILLS[i];
      var u = ((h[0] - scroll) % HSPAN + HSPAN) % HSPAN;
      var x = (u - 0.3) * L.H;
      ctx.beginPath();
      ctx.ellipse(x, base, h[1] * L.H, h[2] * L.H, 0, Math.PI, 0);
      ctx.fill();
    }
    // flat ground under everything, in case the road dips below the horizon
    ctx.fillStyle = S.grass[0];
    ctx.fillRect(0, base, L.W, L.H - base);
  };

  // x = centre, y = ground, k = pixels per metre
  SW.drawProp = function (ctx, p, x, y, k) {
    var h = p.h * k;
    var lw = Math.max(1, k * 0.08);
    ctx.lineWidth = lw;
    ctx.strokeStyle = S.outline;
    if (p.kind === 'bush') {
      ctx.fillStyle = S.leaf[p.v];
      ctx.beginPath();
      ctx.ellipse(x, y, h * 1.1, h, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
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
    } else {
      ctx.arc(x, y - h * 0.65, h * 0.35, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
  };
})(window.SW);
