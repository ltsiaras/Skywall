/* cars.js - three cars drawn from behind with rects and polygons.
   Cosmetic only, they all drive the same. */
(function (SW) {
  'use strict';

  // task colours (signs, feedback flash, box lines)
  SW.STIM = { green: '#1FA84A', red: '#E2362B', blue: '#2563E0', yellow: '#F4C20D' };

  // sizes are fractions of the car's width
  SW.CARS = [
    { id: 'coupe', name: 'Coupe', body: '#2A5FD0', h: 0.5, bodyH: 0.27, cabB: 0.72, cabT: 0.5 },
    { id: 'wagon', name: 'Wagon', body: '#E8812A', h: 0.62, bodyH: 0.28, cabB: 0.86, cabT: 0.8 },
    { id: 'bubble', name: 'Bubble', body: '#8A44B8', h: 0.56, bodyH: 0.3, cabB: 0.7, cabT: 0.3 }
  ];
  SW.CAR = {};
  for (var i = 0; i < SW.CARS.length; i++) SW.CAR[SW.CARS[i].id] = SW.CARS[i];

  function trap(ctx, bw, tw, y0, y1) {
    ctx.beginPath();
    ctx.moveTo(-bw / 2, y0);
    ctx.lineTo(-tw / 2, y1);
    ctx.lineTo(tw / 2, y1);
    ctx.lineTo(bw / 2, y0);
    ctx.closePath();
  }

  /* car with its wheels on (x, bottom), w px wide. o = { lean, brake, shadow } */
  SW.drawCar = function (ctx, d, x, bottom, w, o) {
    o = o || {};
    var h = w * d.h;
    var lw = Math.max(1, Math.round(w * 0.012));

    ctx.save();
    ctx.translate(Math.round(x), Math.round(bottom));

    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.58, w * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(o.lean || 0);
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#000';

    // wheels
    ctx.fillStyle = '#111';
    var tw = w * 0.16, th = h * 0.26;
    ctx.fillRect(-w / 2 + w * 0.06, -th, tw, th);
    ctx.fillRect(w / 2 - w * 0.06 - tw, -th, tw, th);

    // body
    var bb = -h * 0.12, bt = bb - w * d.bodyH;
    ctx.fillStyle = d.body;
    ctx.fillRect(-w / 2, bt, w, bb - bt);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';           // cheap highlight
    ctx.fillRect(-w / 2, bt, w, (bb - bt) * 0.3);
    ctx.strokeRect(-w / 2, bt, w, bb - bt);

    // cabin + rear window
    var ct = -h;
    ctx.fillStyle = d.body;
    if (d.id === 'bubble') {
      ctx.beginPath();
      ctx.ellipse(0, bt, w * d.cabB / 2, bt - ct, 0, Math.PI, 0);
      ctx.closePath();
    } else {
      trap(ctx, w * d.cabB, w * d.cabT, bt, ct);
    }
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#A9D8F5';
    if (d.id === 'bubble') {
      ctx.beginPath();
      ctx.ellipse(0, bt - h * 0.04, w * d.cabB / 2 - w * 0.07, (bt - ct) - h * 0.14, 0, Math.PI, 0);
      ctx.closePath();
    } else {
      trap(ctx, w * d.cabB - w * 0.12, w * d.cabT - w * 0.1, bt - h * 0.04, ct + h * 0.08);
    }
    ctx.fill(); ctx.stroke();

    // tail lights
    ctx.fillStyle = o.brake > 0.15 ? '#FF3B3B' : '#9E1010';
    var lw2 = w * 0.18, lh = h * 0.11, ly = bt + h * 0.05;
    ctx.fillRect(-w / 2 + w * 0.05, ly, lw2, lh);
    ctx.strokeRect(-w / 2 + w * 0.05, ly, lw2, lh);
    ctx.fillRect(w / 2 - w * 0.05 - lw2, ly, lw2, lh);
    ctx.strokeRect(w / 2 - w * 0.05 - lw2, ly, lw2, lh);

    // bumper + plate
    ctx.fillStyle = '#888';
    ctx.fillRect(-w * 0.48, bb - h * 0.06, w * 0.96, h * 0.08);
    ctx.strokeRect(-w * 0.48, bb - h * 0.06, w * 0.96, h * 0.08);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(-w * 0.12, bb - h * 0.2, w * 0.24, h * 0.1);
    ctx.strokeRect(-w * 0.12, bb - h * 0.2, w * 0.24, h * 0.1);

    ctx.restore();
  };
})(window.SW = window.SW || {});
