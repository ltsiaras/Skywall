/* Skywall · protocol.js
   The study's task parameters and the pure logic built on them: sign schedule,
   road pieces, scoring, the 80% staircase. No DOM here, so Node can test it.
   Where each number comes from: skywall/README.md → "What the study did". */
(function (root) {
  'use strict';

  const P = {
    runSeconds: 180,          // every run is 3 minutes
    targets: 24,              // 24 targets and 48 lures per run (Experiments 2 & 3)
    lures: 48,
    isi: [2, 2.5, 3],         // sign onset to next onset, seconds
    signMs: 400,              // each sign is on screen for 400 ms
    feedbackMs: 100,          // fixation-cross colour change
    tailSeconds: 1.2,         // after the last sign, so its window can close
    sign: { min: 1, max: 54, start: 29 },   // 54 sign levels, everyone starts at 29 (500 ms)
    road: { min: 0, max: 199, start: 20 },  // 200 road levels, everyone starts at 20
    stair: { low: 77.5, high: 82.5 },       // no level change between 77.5% and 82.5%
    signStep: 1.75, signUp: 10, signDown: 10, // one sign level per 1.75% away from the band
    roadStep: 0.58, roadUp: 30, roadDown: 20, // one road level per 0.58% away from the band
    overallCriterion: 80,     // both tasks above 80% → Overall level +1
    factEvery: 4,             // a fun-fact screen after every 4th run
    runsPerStop: 20,          // a training day was 20 runs…
    stops: 12,                // …and the course was 12 days
    pieceSeconds: [2, 2.5, 3] // each road piece lasts 2, 2.5 or 3 s
  };

  // ---------- small helpers ----------

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // mulberry32: tiny seeded PRNG so a run can be replayed from its seed.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function longestRun(arr, test) {
    let best = 0, cur = 0;
    for (const v of arr) { cur = test(v) ? cur + 1 : 0; if (cur > best) best = cur; }
    return best;
  }

  // ---------- signs ----------
  // Three colours × three shapes. The target is one conjunction; the other
  // eight share one feature with it or none. Colours are the site's palette
  // (Sky, Ink, Cloud) instead of the study's green, red and blue.

  const COLORS = [
    { id: 'blue', fill: 'sky' },
    { id: 'black', fill: 'ink' },
    { id: 'white', fill: 'cloud' }
  ];
  const SHAPES = ['circle', 'pentagon', 'square'];
  const KINDS = [];
  for (const c of COLORS) {
    for (const s of SHAPES) {
      KINDS.push({ id: c.id + '-' + s, color: c.id, fill: c.fill, shape: s, name: c.id + ' ' + s });
    }
  }
  const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));

  // The study showed each day's target before training. Day one is always the
  // blue circle (our stand-in for the study's green circle), then it rotates.
  const TARGET_ORDER = [
    'blue-circle', 'black-square', 'white-pentagon',
    'blue-square', 'white-circle', 'black-pentagon',
    'blue-pentagon', 'black-circle', 'white-square'
  ];

  function targetForDay(dayIndex) {
    const n = TARGET_ORDER.length;
    return KIND[TARGET_ORDER[((dayIndex % n) + n) % n]];
  }

  // One run's signs: 24 targets and 48 lures (6 of each of the 8 lures), in a
  // shuffled order with no more than 3 targets in a row, at shuffled 2/2.5/3 s
  // gaps. The 72 gaps add up to exactly 180 s, so the last sign lands at 3:00.
  function makeSigns(rand, target) {
    const lures = KINDS.filter(k => k.id !== target.id);
    let kinds, tries = 0;
    do {
      kinds = [];
      for (let i = 0; i < P.targets; i++) kinds.push(target);
      for (let i = 0; i < P.lures; i++) kinds.push(lures[i % lures.length]);
      shuffle(kinds, rand);
    } while (longestRun(kinds, k => k === target) > 3 && ++tries < 500);

    const gaps = [];
    for (let i = 0; i < kinds.length; i++) gaps.push(P.isi[i % P.isi.length]);
    shuffle(gaps, rand);

    let t = 0;
    return kinds.map((kind, i) => {
      t += gaps[i];
      return {
        t,                       // scheduled onset, seconds into the run
        kind,
        isTarget: kind === target,
        shownAt: null,           // run time of the frame that first drew it
        pressed: false,
        settled: false,          // its response window has closed
        outcome: null,           // hit | miss | late | fa | cr
        rt: null                 // ms from shownAt
      };
    });
  }

  // ---------- road ----------
  // Pieces are left/right turns and up/down hills, each shallow or steep:
  // 8 kinds in equal numbers, never the same kind twice in a row, no straights.

  const PIECE_TYPES = [];
  for (const kind of ['turn', 'hill']) {
    for (const dir of [-1, 1]) {          // turn: -1 left, +1 right · hill: -1 down, +1 up
      for (const sev of ['shallow', 'steep']) PIECE_TYPES.push({ kind, dir, sev });
    }
  }

  function makePieces(rand, count) {
    count = count || 72;
    const per = Math.ceil(count / PIECE_TYPES.length);
    for (let attempt = 0; attempt < 50; attempt++) {
      const left = PIECE_TYPES.map(() => per);
      const order = [];
      let prev = -1, ok = true;
      for (let i = 0; i < count; i++) {
        const remaining = left.reduce((a, b) => a + b, 0);
        // If one kind would be forced to repeat later, take it now.
        let forced = -1;
        left.forEach((n, k) => { if (k !== prev && n > (remaining - n) + 1) forced = k; });
        let pick = forced;
        if (pick < 0) {
          let total = 0;
          left.forEach((n, k) => { if (k !== prev) total += n; });
          if (total === 0) { ok = false; break; }
          let r = rand() * total;
          for (let k = 0; k < left.length; k++) {
            if (k === prev) continue;
            r -= left[k];
            if (r < 0) { pick = k; break; }
          }
          if (pick < 0) pick = left.findIndex((n, k) => n > 0 && k !== prev);
        }
        if (pick < 0) { ok = false; break; }
        left[pick]--; order.push(pick); prev = pick;
      }
      if (!ok) continue;
      const secs = [];
      for (let i = 0; i < count; i++) secs.push(P.pieceSeconds[i % P.pieceSeconds.length]);
      shuffle(secs, rand);
      return order.map((k, i) => Object.assign({ seconds: secs[i] }, PIECE_TYPES[k]));
    }
    throw new Error('could not order road pieces');
  }

  // ---------- levels ----------

  // Sign level → response window. Level 54 is 250 ms and every level down adds
  // 10 ms to level 19 (600 ms); below that each level adds 25 ms, up to 1000 ms.
  function windowMs(level) {
    const L = clamp(Math.round(level), P.sign.min, P.sign.max);
    if (L >= 19) return 250 + (54 - L) * 10;
    return Math.min(1000, 600 + (19 - L) * 25);
  }

  // Road level → pace. Level 0 crawls; level 20 (the start) is 1.0.
  // The paper gives no speeds, so this curve is ours.
  function roadFactor(level) {
    const L = clamp(level, P.road.min, P.road.max);
    return 0.45 + 0.55 * Math.pow(L / 20, 0.8);
  }
  function roadSpeed(level) { return 16.7 * roadFactor(level); } // m/s; level 20 ≈ 60 km/h

  // The staircase: no change inside 77.5–82.5%, otherwise one level for every
  // step away from that band. 90% on signs → +4 levels (40 ms shorter);
  // 55% or less → −10 levels (100 ms longer).
  function stair(acc, step, up, down) {
    if (acc > P.stair.high) return clamp(Math.round((acc - P.stair.high) / step), 1, up);
    if (acc < P.stair.low) return -clamp(Math.round((P.stair.low - acc) / step), 1, down);
    return 0;
  }
  function signDelta(acc) { return stair(acc, P.signStep, P.signUp, P.signDown); }
  function roadDelta(acc) { return stair(acc, P.roadStep, P.roadUp, P.roadDown); }

  // ---------- scoring ----------

  // Acklam's inverse normal CDF.
  function probit(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425, hi = 1 - lo;
    let q, r;
    if (p < lo) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > hi) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // d′ with the log-linear correction, so 100% hits or 0% false alarms stay finite.
  function dprime(hits, nTargets, fas, nLures) {
    const h = (hits + 0.5) / (nTargets + 1);
    const f = (fas + 0.5) / (nLures + 1);
    return probit(h) - probit(f);
  }

  // Sign score, as in the study: proportion correct over every sign shown.
  // Correct = a target answered inside its window, or a lure left alone.
  // Wrong = a missed target, a late answer, or an answer to a lure.
  function scoreRun(signs, onRoadSeconds, drivenSeconds) {
    const shown = signs.filter(s => s.shownAt !== null);
    const n = { hit: 0, miss: 0, late: 0, fa: 0, cr: 0 };
    let rtSum = 0;
    for (const s of shown) {
      const o = s.outcome || (s.isTarget ? 'miss' : 'cr');
      n[o]++;
      if (o === 'hit') rtSum += s.rt;
    }
    const targets = shown.filter(s => s.isTarget).length;
    const lures = shown.length - targets;
    const signAcc = shown.length ? 100 * (n.hit + n.cr) / shown.length : 0;
    const driveAcc = drivenSeconds > 0 ? 100 * onRoadSeconds / drivenSeconds : 0;
    return {
      signs: shown.length, targets, lures,
      hits: n.hit, misses: n.miss, late: n.late, fas: n.fa, crs: n.cr,
      signAcc, driveAcc,
      dprime: dprime(n.hit, targets, n.fa, lures),
      meanRt: n.hit ? rtSum / n.hit : null,
      both: signAcc > P.overallCriterion && driveAcc > P.overallCriterion
    };
  }

  // The study's multitasking cost: % change in d′ from signs alone to signs while driving.
  function multitaskingCost(dSignAndDrive, dSignOnly) {
    return (dSignAndDrive - dSignOnly) / dSignOnly * 100;
  }

  const api = {
    P, KINDS, KIND, TARGET_ORDER, PIECE_TYPES,
    clamp, rng, shuffle, longestRun,
    targetForDay, makeSigns, makePieces,
    windowMs, roadFactor, roadSpeed, signDelta, roadDelta,
    probit, dprime, scoreRun, multitaskingCost
  };

  root.SW = Object.assign(root.SW || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
