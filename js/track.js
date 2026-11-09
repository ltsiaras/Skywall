/* Skywall · track.js
   Turns road pieces into 2 m segments for the renderer. A piece lasts 2–3 s
   at the level's pace, so its length in metres is seconds × speed. Turns and
   hills are scaled by 1/pace, so every level draws the same road shapes,
   only faster. */
(function (SW) {
  'use strict';

  const SEG = 2;                                  // metres per segment
  const GRADE = { shallow: 0.075, steep: 0.15 };  // rise per metre at pace 1
  const CURVE = { shallow: 1 / 95, steep: 1 / 48 }; // 1/radius in metres at pace 1
  const EASE = 4;                                 // segments to blend shape between pieces

  function smooth(t) { return t * t * (3 - 2 * t); }

  class Track {
    constructor(rand, speed, factor) {
      this.rand = rand;
      this.speed = speed;       // nominal m/s for this level
      this.factor = factor;     // pace relative to level 20
      this.segs = [];
      this.y = 0;               // running elevation
      this.grade = 0;
      this.curve = 0;
      // Scenery draws from its own stream, so the road never depends on it.
      this.propRand = SW.rng(Math.floor(rand() * 4294967296));
      this.nextProp = 2;
    }

    get length() { return this.segs.length * SEG; }

    addStraight(metres) {
      const n = Math.round(metres / SEG);
      for (let i = 0; i < n; i++) this.push(0, 0, null);
      this.grade = 0; this.curve = 0;
    }

    addPieces(pieces) { for (const p of pieces) this.addPiece(p); }

    addPiece(p) {
      const n = Math.max(6, Math.round(p.seconds * this.speed / SEG));
      const g1 = p.kind === 'hill' ? p.dir * GRADE[p.sev] / this.factor : 0;
      const c1 = p.kind === 'turn' ? p.dir * CURVE[p.sev] / this.factor : 0;
      const g0 = this.grade, c0 = this.curve;
      for (let i = 0; i < n; i++) {
        const e = i < EASE ? smooth((i + 1) / EASE) : 1;
        this.push(g0 + (g1 - g0) * e, c0 + (c1 - c0) * e, p);
      }
      this.grade = g1; this.curve = c1;
    }

    push(grade, curve, piece) {
      const i = this.segs.length;
      const y0 = this.y;
      this.y += grade * SEG;
      const seg = { i, s: i * SEG, y0, y1: this.y, grade, curve, piece, prop: null };
      // Trees and bushes in the fields beside the road.
      if (--this.nextProp <= 0) {
        const r = this.propRand;
        this.nextProp = 2 + Math.floor(r() * 5);
        const side = r() < 0.5 ? -1 : 1;
        const roll = r();
        const kind = roll < 0.5 ? 'oak' : roll < 0.72 ? 'pine' : 'bush';
        const spec = SW.PROPS[kind];
        const near = kind === 'bush' ? 6.5 : 8.5;
        seg.prop = {
          kind,
          x: side * (near + r() * (kind === 'bush' ? 10 : 34)),
          h: spec.h[0] + r() * (spec.h[1] - spec.h[0]),
          v: Math.floor(r() * 3)
        };
      }
      this.segs.push(seg);
    }

    // Keep at least `metres` of road ahead of position s.
    extend(s, metres) {
      while (this.length < s + metres) this.addPieces(SW.makePieces(this.rand, 8));
    }

    at(s) {
      const i = Math.floor(s / SEG);
      return this.segs[i < 0 ? 0 : i >= this.segs.length ? this.segs.length - 1 : i];
    }

    yAt(s) {
      const seg = this.at(s);
      const t = SW.clamp((s - seg.s) / SEG, 0, 1);
      return seg.y0 + (seg.y1 - seg.y0) * t;
    }
  }

  SW.SEG = SEG;
  SW.Track = Track;
})(window.SW);
