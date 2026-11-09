/* Skywall · cars.js
   Three cars, drawn from behind in the four colours. Purely cosmetic: they
   all drive the same. */
(function (SW) {
  'use strict';

  const C = SW.COLORS = { sky: '#1470C4', haze: '#BCD4EA', cloud: '#F6F4EE', ink: '#0A1626' };
  // The study's task colours: sign fills, answer feedback and the box's
  // yellow and red boundaries. Everything else stays in the four colours.
  SW.STIM = { green: '#1FA84A', red: '#E2362B', blue: '#2563E0', yellow: '#F4C20D' };

  // Proportions are fractions of the car's width.
  SW.CARS = [
    { id: 'coupe', name: 'Coupe', body: 'sky', trim: 'cloud', light: 'cloud',
      h: 0.5, bodyH: 0.27, cabinBottom: 0.7, cabinTop: 0.5, radius: 0.1, roofR: 0.07 },
    { id: 'wagon', name: 'Wagon', body: 'cloud', trim: 'sky', light: 'sky',
      h: 0.6, bodyH: 0.28, cabinBottom: 0.84, cabinTop: 0.78, radius: 0.05, roofR: 0.03 },
    { id: 'bubble', name: 'Bubble', body: 'ink', trim: 'cloud', light: 'cloud', glass: 'sky', line: 'haze',
      h: 0.56, bodyH: 0.29, cabinBottom: 0.74, cabinTop: 0.38, radius: 0.16, roofR: 0.2 }
  ];
  SW.CAR = Object.fromEntries(SW.CARS.map(c => [c.id, c]));

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Trapezoid cabin with rounded top corners.
  function cabin(ctx, bw, tw, y0, y1, r) {
    ctx.beginPath();
    ctx.moveTo(-bw / 2, y0);
    ctx.lineTo(-tw / 2, y1 + r);
    ctx.quadraticCurveTo(-tw / 2, y1, -tw / 2 + r, y1);
    ctx.lineTo(tw / 2 - r, y1);
    ctx.quadraticCurveTo(tw / 2, y1, tw / 2, y1 + r);
    ctx.lineTo(bw / 2, y0);
    ctx.closePath();
  }

  /* Draw a car with its rear wheels touching (x, bottom), `w` pixels wide.
     o.lean (radians), o.brake (0–1), o.shadow (bool) */
  SW.drawCar = function (ctx, design, x, bottom, w, o) {
    o = o || {};
    const d = design;
    const h = w * d.h;
    const line = Math.max(1, w * 0.014);

    ctx.save();
    ctx.translate(x, bottom);

    if (o.shadow !== false) {
      ctx.fillStyle = C.ink;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.ellipse(0, -w * 0.01, w * 0.6, w * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(o.lean || 0);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C[d.line || 'ink'];
    ctx.lineWidth = line;

    // Tyres
    ctx.fillStyle = C.ink;
    const tw = w * 0.17, th = h * 0.26;
    rrect(ctx, -w / 2 + w * 0.05, -th, tw, th, tw * 0.25); ctx.fill();
    rrect(ctx, w / 2 - w * 0.05 - tw, -th, tw, th, tw * 0.25); ctx.fill();

    // Body
    const bodyBottom = -h * 0.1;
    const bodyTop = bodyBottom - w * d.bodyH;
    ctx.fillStyle = C[d.body];
    rrect(ctx, -w / 2, bodyTop, w, bodyBottom - bodyTop, w * d.radius);
    ctx.fill();
    // daylight on the body: a lit shoulder, a shaded sill
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.cloud;
    ctx.globalAlpha = d.body === 'cloud' ? 0.5 : 0.16;
    ctx.fillRect(-w / 2, bodyTop, w, (bodyBottom - bodyTop) * 0.3);
    ctx.fillStyle = C.ink;
    ctx.globalAlpha = d.body === 'ink' ? 0.5 : 0.16;
    ctx.fillRect(-w / 2, bodyBottom - (bodyBottom - bodyTop) * 0.28, w, h);
    ctx.restore();
    rrect(ctx, -w / 2, bodyTop, w, bodyBottom - bodyTop, w * d.radius);
    ctx.stroke();

    // Cabin and rear window
    const cabTop = -h;
    ctx.fillStyle = C[d.body];
    cabin(ctx, w * d.cabinBottom, w * d.cabinTop, bodyTop + line, cabTop, w * d.roofR);
    ctx.fill(); ctx.stroke();

    const inset = w * 0.05;
    const gBottom = bodyTop - h * 0.04;
    const gTop = cabTop + h * 0.09;
    const k = (gBottom - gTop) / (bodyTop - cabTop);
    const gbw = w * d.cabinBottom - inset * 2;
    const gtw = Math.max(w * 0.12, w * (d.cabinBottom - (d.cabinBottom - d.cabinTop) * k) - inset * 2);
    ctx.fillStyle = C[d.glass || 'ink'];
    cabin(ctx, gbw, gtw, gBottom, gTop, w * d.roofR * 0.6);
    ctx.fill();
    // a single glint
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = C.haze;
    ctx.lineWidth = w * 0.03;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(-gbw * 0.15, gBottom + 2);
    ctx.lineTo(gtw * 0.2, gTop - 2);
    ctx.stroke();
    ctx.restore();

    // Trim stripe across the body
    ctx.fillStyle = C[d.trim];
    ctx.fillRect(-w / 2 + line, bodyTop + (bodyBottom - bodyTop) * 0.5, w - line * 2, h * 0.055);

    // Tail lights: Haze when off, the design's light colour when braking
    const lw = w * 0.2, lh = h * 0.12, ly = bodyTop + h * 0.05;
    ctx.fillStyle = o.brake > 0.15 ? C[d.light] : (d.body === 'haze' ? C.cloud : C.haze);
    rrect(ctx, -w / 2 + w * 0.06, ly, lw, lh, lh * 0.4); ctx.fill(); ctx.stroke();
    rrect(ctx, w / 2 - w * 0.06 - lw, ly, lw, lh, lh * 0.4); ctx.fill(); ctx.stroke();
    if (o.brake > 0.15) {
      ctx.globalAlpha = 0.35 * Math.min(1, o.brake);
      ctx.fillStyle = C.cloud;
      ctx.beginPath();
      ctx.ellipse(-w / 2 + w * 0.06 + lw / 2, ly + lh / 2, lw * 0.9, lh * 1.4, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 - w * 0.06 - lw / 2, ly + lh / 2, lw * 0.9, lh * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Plate and bumper
    ctx.fillStyle = d.body === 'ink' ? C.haze : C.ink;
    rrect(ctx, -w * 0.47, bodyBottom - h * 0.075, w * 0.94, h * 0.09, h * 0.04); ctx.fill();
    ctx.fillStyle = C.cloud;
    rrect(ctx, -w * 0.12, bodyBottom - h * 0.2, w * 0.24, h * 0.1, h * 0.02); ctx.fill(); ctx.stroke();

    ctx.restore();
  };

  SW.rrect = rrect;
})(window.SW = window.SW || {});
