/* Skywall · game.js
   The loop and the screens: menu → before the run → 3-minute run → results
   (→ a fun fact every 4th run) → before the next run. */
(function (SW) {
  'use strict';

  const P = SW.P;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', e => { reduced = e.matches; });

  // ?run=30 shortens a run to its first 30 seconds of signs (for trying things out).
  const params = new URLSearchParams(location.search);
  const RUN_SECONDS = SW.clamp(+params.get('run') || P.runSeconds, 6, P.runSeconds);

  // ---------- driving model ----------
  // Rate control on both axes, like a compensatory tracking task: the stick
  // sets how fast the car moves across the box (x) and along it (y, which is
  // speed within the level's min–max band). Turns push the car outward, hills
  // slow it (up) or speed it (down). All of it scales with the road's pace.
  const STEER = 1.3;           // box half-widths per second at full stick
  const THROTTLE = 1.3;        // box half-depths per second at full stick
  const PUSH = { shallow: 0.36, steep: 0.72 };
  const SPEED_BAND = 0.25;     // min and max speed are ±25% of the level's pace
  const X_LIM = 0.68;          // the car's side reaches the road edge
  const X_HARD = 1.5;          // how far off the road the car can go
  const Y_LIM = 0.97;          // at the speed limit = touching the box's front or back

  const FACTS = [
    'Your brain is about 2% of your body weight, yet it burns roughly a fifth of your energy at rest.',
    'An adult brain has around 86 billion neurons.',
    'About four in five of those neurons sit in the cerebellum, the fold at the back of the brain that keeps your movements smooth.',
    'The fastest nerve fibres carry signals at up to about 120 metres a second, over 400 km/h.',
    'Your eyes jump three or four times a second. The jumps are called saccades, and your brain hides the blur between them.',
    'Sharp vision covers only about two degrees at the centre of your gaze, about the width of your thumb at arm’s length. That’s why the sign sits so close to the cross.',
    'Each eye has a blind spot where the optic nerve leaves it. You never see the hole because your brain fills it in.',
    'A simple reaction to a flash of light takes most people about a fifth to a quarter of a second.',
    'When you “multitask”, your attention mostly switches back and forth, and every switch costs a little time.',
    'Practice reshapes the brain: London taxi drivers, who learn thousands of streets, have a larger rear hippocampus than most people.',
    'Sleep after practice helps a new skill stick.',
    'Your heart beats about 100,000 times a day.',
    'In the 2013 study this game is built from, people aged 60 to 85 trained for 12 hours and ended up multitasking better than untrained 20-year-olds.',
    'Those gains were still there six months later, with no training in between.',
    'You blink 15 to 20 times a minute, and your brain keeps the world from going dark each time.',
    'Before any training, the 2013 study had 174 people aged 20 to 79 play the game. Multitasking got harder steadily with age, decade by decade.',
    'The training study split 46 people aged 60 to 85 three ways: both tasks at once, one task at a time, or no training at all.',
    'Training on both tasks at once also helped with things the game never practised, like holding things in mind and staying focused.',
    'The ideas behind that study went on to EndeavorRx, which in 2020 became the first video game the US FDA authorised as a treatment, for children with ADHD.'
  ];

  // ---------- set-up ----------
  const canvas = $('#scene');
  const renderer = new SW.Renderer(canvas);

  const input = new SW.Input($('#touch'));
  let store = SW.store.load();
  let state = 'menu';
  let world = makeWorld(store.roadLevel, newSeed());
  let run = null;

  function newSeed() { return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0; }

  function makeWorld(level, seed) {
    const rand = SW.rng(seed);
    const factor = SW.roadFactor(level);
    const speed = SW.roadSpeed(level);
    const track = new SW.Track(rand, speed, factor);
    track.addStraight(40);
    track.addPieces(SW.makePieces(rand, 72));
    return {
      level, factor, speed, track,
      carS: 24, x: 0, y: 0, ux: 0, uy: 0,
      onRoad: true, hitLeft: false, hitRight: false, hitFront: false, hitBack: false,
      bgX: 0, bgY: 0
    };
  }

  function stepWorld(w, dt, ux, uy, auto) {
    const piece = w.track.at(w.carS).piece;
    let px = 0, py = 0;
    if (piece) {
      const push = PUSH[piece.sev];
      if (piece.kind === 'turn') px = -piece.dir * push;  // a right turn pushes you left
      else py = -piece.dir * push;                        // uphill slows you down
    }
    if (auto) {
      ux = SW.clamp(-px / STEER - w.x * 1.8, -1, 1);
      uy = SW.clamp(-py / THROTTLE - w.y * 1.8, -1, 1);
    }
    w.ux = ux; w.uy = uy;
    w.x = SW.clamp(w.x + (ux * STEER + px) * w.factor * dt, -X_HARD, X_HARD);
    w.y = SW.clamp(w.y + (uy * THROTTLE + py) * w.factor * dt, -1, 1);
    const v = w.speed * (1 + SPEED_BAND * w.y);
    w.carS += v * dt;
    w.track.extend(w.carS, 700);

    w.hitLeft = w.x <= -X_LIM;
    w.hitRight = w.x >= X_LIM;
    w.hitBack = w.y <= -Y_LIM;
    w.hitFront = w.y >= Y_LIM;
    w.onRoad = !(w.hitLeft || w.hitRight || w.hitBack || w.hitFront);

    const seg = w.track.at(w.carS);
    w.bgX += seg.curve * v * dt * 0.5;
    w.bgY += (seg.grade * 0.5 - w.bgY) * (1 - Math.exp(-dt / 0.5));
  }

  // ---------- a run ----------
  function newRun() {
    const seed = newSeed();
    const target = SW.targetForDay(SW.store.dayIndex(store));
    const signs = SW.makeSigns(SW.rng(seed ^ 0x9E3779B9), target).filter(s => s.t <= RUN_SECONDS);
    world = makeWorld(store.roadLevel, seed);
    run = {
      index: store.runs + 1,
      seed, target, signs,
      signLevel: store.signLevel,
      roadLevel: store.roadLevel,
      windowMs: SW.windowMs(store.signLevel),
      end: signs[signs.length - 1].t + P.tailSeconds,
      t: 0, startPerf: 0, pausedAt: 0, pausedTotal: 0,
      next: 0, current: -1,
      onRoad: 0, driven: 0,
      flash: null
    };
  }

  function runTime(perfMs) { return (perfMs - run.startPerf - run.pausedTotal) / 1000; }

  function flash(ok, now) { run.flash = { ok, until: (now || performance.now()) + P.feedbackMs }; }

  // A press belongs to the latest sign shown before it, until the next sign
  // appears. Only the first press on a sign counts.
  function respond(perfMs) {
    const t = runTime(perfMs);
    let i = run.current;
    while (i >= 0 && run.signs[i].shownAt > t) i--;
    if (i < 0) return;
    const s = run.signs[i];
    if (s.pressed) return;
    s.pressed = true;
    s.rt = Math.max(0, (t - s.shownAt) * 1000);
    if (s.isTarget) {
      if (!s.settled && s.rt <= run.windowMs) {
        s.outcome = 'hit'; s.settled = true; flash(true);
      } else {
        s.outcome = 'late';
        if (!s.settled) { s.settled = true; flash(false); }
      }
    } else {
      s.outcome = 'fa'; s.settled = true; flash(false);
    }
  }

  function updatePlay(now, dt) {
    run.t = runTime(now);

    while (run.next < run.signs.length && run.signs[run.next].t <= run.t) {
      run.signs[run.next].shownAt = run.t;
      run.current = run.next++;
    }

    // Close response windows: a silent target is a miss, a silent lure is correct.
    for (let i = Math.max(0, run.current - 1); i <= run.current; i++) {
      const s = run.signs[i];
      if (!s || s.settled || s.shownAt === null) continue;
      if ((run.t - s.shownAt) * 1000 >= run.windowMs) {
        s.settled = true;
        if (!s.pressed) { s.outcome = s.isTarget ? 'miss' : 'cr'; flash(!s.isTarget, now); }
      }
    }

    stepWorld(world, dt, input.x, input.y, false);
    run.driven += dt;
    if (world.onRoad) run.onRoad += dt;

    const clock = fmtClock(Math.min(RUN_SECONDS, run.end - run.t));   // 3:00 down, not 3:02
    if (clock !== run.clock) { run.clock = clock; clockEl.textContent = clock; }
    if (run.t > 0.6 && !countEl.hidden) countEl.hidden = true;
    if (run.t >= run.end) finish();
  }

  function finish() {
    const sc = SW.scoreRun(run.signs, run.onRoad, run.driven);
    const dSign = SW.signDelta(sc.signAcc);
    const dRoad = SW.roadDelta(sc.driveAcc);
    const before = { window: run.windowMs, road: store.roadLevel };
    store.signLevel = SW.clamp(store.signLevel + dSign, P.sign.min, P.sign.max);
    store.roadLevel = SW.clamp(store.roadLevel + dRoad, P.road.min, P.road.max);
    if (sc.both) store.overall += 1;
    store.runs += 1;
    store.history.push({
      at: new Date().toISOString(), run: store.runs, target: run.target.id, seed: run.seed,
      signLevel: run.signLevel, windowMs: run.windowMs, roadLevel: run.roadLevel,
      signAcc: +sc.signAcc.toFixed(1), driveAcc: +sc.driveAcc.toFixed(1),
      dprime: +sc.dprime.toFixed(2), meanRt: sc.meanRt === null ? null : Math.round(sc.meanRt),
      hits: sc.hits, misses: sc.misses, late: sc.late, fas: sc.fas, crs: sc.crs
    });
    if (store.history.length > 300) store.history.splice(0, store.history.length - 300);
    SW.store.save(store);
    fillResults(sc, before);
    setState('results');
  }

  // ---------- screens ----------
  const screens = { menu: $('#menu'), about: $('#about'), brief: $('#brief'), pause: $('#pause'), results: $('#results'), fact: $('#fact') };
  const hud = $('#hud'), touch = $('#touch'), clockEl = $('[data-clock]'), countEl = $('#count');
  let countStart = 0;

  function setState(next) {
    state = next;
    const screenFor = { menu: 'menu', about: 'about', brief: 'brief', paused: 'pause', results: 'results', fact: 'fact' };
    const show = screenFor[next];
    for (const [name, el] of Object.entries(screens)) {
      el.hidden = name !== show;
    }
    const playing = next === 'play';
    input.captureKeys = playing;
    hud.hidden = !(playing || next === 'paused' || next === 'count');
    if (next !== 'count' && next !== 'play') countEl.hidden = true;
    touch.hidden = !playing || input.mode !== 'touch';
    if (playing && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (show) {
      const primary = $('.btn.primary', screens[show]);
      if (primary && input.mode !== 'touch') primary.focus({ preventScroll: true });
    }
    document.body.dataset.state = next;
  }

  function start() { store = SW.store.load(); toBrief(); }

  function toBrief() {
    newRun();
    $$('[data-run]').forEach(el => { el.textContent = 'Run ' + run.index; });
    paintTarget(run.target);
    setState('brief');
  }

  // 3, 2, 1 before the run clock starts. "GO!" stays up for the first
  // 0.6 s of the run; the first sign never comes before 2 s.
  const COUNT_STEP = 0.7;

  function go() {
    if (state !== 'brief') return;
    countStart = performance.now();
    clockEl.textContent = fmtClock(RUN_SECONDS);
    showCount('3');
    setState('count');
  }

  function updateCount(now) {
    const t = (now - countStart) / 1000;
    if (t >= COUNT_STEP * 3) { begin(); return; }
    showCount(String(3 - Math.floor(t / COUNT_STEP)));
  }

  function showCount(text) {
    if (countEl.textContent !== text) countEl.textContent = text;
    countEl.hidden = false;
  }

  function begin() {
    input.reset();
    run.startPerf = performance.now();
    showCount('GO!');
    setState('play');
  }

  function fmtClock(sec) {
    const left = Math.max(0, Math.ceil(sec));
    return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  }

  function pause() {
    if (state !== 'play') return;
    run.pausedAt = performance.now();
    setState('paused');
  }

  function resume() {
    if (state !== 'paused') return;
    run.pausedTotal += performance.now() - run.pausedAt;
    input.reset();
    setState('play');
  }

  function toMenu() {
    run = null;
    world = makeWorld(store.roadLevel, newSeed());
    paintMenu();
    setState('menu');
  }

  function next() {
    if (store.runs % P.factEvery === 0) {
      $('[data-fact]').textContent = FACTS[(store.runs / P.factEvery - 1) % FACTS.length];
      setState('fact');
    } else {
      toBrief();
    }
  }

  // ---------- painting the HTML ----------
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function paintSign(cv, kind) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    SW.drawSign(ctx, kind, cv.width / 2, cv.height / 2, cv.width * 0.3);
  }

  function paintTarget(kind) {
    $$('[data-sign]').forEach(cv => paintSign(cv, kind));
    $$('[data-target-name]').forEach(el => { el.textContent = cap(kind.name); });
    $$('[data-target-inline]').forEach(el => { el.textContent = 'the ' + kind.name; });
  }

  function paintMenu() {
    paintTarget(SW.targetForDay(SW.store.dayIndex(store)));
    $('[data-window]').textContent = SW.windowMs(store.signLevel) + ' ms';
    $('[data-road]').textContent = String(store.roadLevel);
    $('[data-overall]').textContent = String(store.overall);

    const stop = Math.min(P.stops - 1, Math.floor(store.runs / P.runsPerStop));
    const done = store.runs >= P.stops * P.runsPerStop;
    const inStop = done ? P.runsPerStop : store.runs - stop * P.runsPerStop;
    $('[data-journey]').textContent = done
      ? 'All 12 sessions done (the full study). Keep going!'
      : `Session ${stop + 1} of ${P.stops}, run ${inStop} of ${P.runsPerStop}`;

    $$('.cars input').forEach(r => { r.checked = r.value === store.car; });
    paintGraph();
  }

  // last 20 runs: signs (yellow) and driving (cyan), with the 80% line
  function paintGraph() {
    const cv = $('[data-graph]');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, padL = 30, padR = 8, padT = 8, padB = 16;
    const runs = store.history.slice(-20);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '10px Verdana, sans-serif';
    ctx.textBaseline = 'middle';
    const yOf = v => padT + (1 - v / 100) * (H - padT - padB);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    for (const v of [0, 50, 100]) {
      const y = Math.round(yOf(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(v + '%', padL - 4, y);
    }
    ctx.strokeStyle = '#999';
    ctx.setLineDash([4, 3]);
    const y80 = Math.round(yOf(80)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, y80); ctx.lineTo(W - padR, y80); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#bbb';
    ctx.fillText('80', padL - 4, y80);
    if (!runs.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.fillText('No runs yet. Your scores show up here.', (W + padL) / 2, H / 2 + 6);
      return;
    }
    const step = (W - padL - padR) / Math.max(1, 19);
    const xOf = i => padL + i * step + (runs.length === 1 ? (W - padL - padR) / 2 : 0);
    for (const [key, color] of [['signAcc', '#FFD200'], ['driveAcc', '#4FC3F7']]) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      runs.forEach((r, i) => { const x = xOf(i), y = yOf(r[key]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      runs.forEach((r, i) => ctx.fillRect(xOf(i) - 2, yOf(r[key]) - 2, 4, 4));
    }
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('run ' + runs[0].run, padL, H - 6);
    ctx.textAlign = 'right';
    ctx.fillText('run ' + runs[runs.length - 1].run, W - padR, H - 6);
  }

  function buildCars() {
    const wrap = $('.cars');
    for (const design of SW.CARS) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'car';
      radio.value = design.id;
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 64;
      cv.setAttribute('aria-hidden', 'true');
      SW.drawCar(cv.getContext('2d'), design, cv.width / 2, cv.height * 0.88, cv.width * 0.66, { shadow: false });
      radio.addEventListener('change', () => {
        store.car = design.id;
        SW.store.save(store);
        paintMenu();
      });
      label.append(radio, cv, document.createTextNode(design.name));
      wrap.appendChild(label);
    }
  }

  function signed(n) { return n > 0 ? '+' + n : String(n); }

  function fillResults(sc, before) {
    const pct = v => Math.round(v) + '%';
    $('[data-sign-acc]').textContent = pct(sc.signAcc);
    $('[data-drive-acc]').textContent = pct(sc.driveAcc);
    for (const [sel, v] of [['[data-sign-bar]', sc.signAcc], ['[data-drive-bar]', sc.driveAcc]]) {
      const bar = $(sel);
      bar.style.width = SW.clamp(v, 0, 100) + '%';
      bar.className = v > P.overallCriterion ? 'ok' : '';
    }
    $('[data-overall-line]').textContent = sc.both
      ? `Both above 80%. Overall level ${store.overall}, up one.`
      : `Overall level stays at ${store.overall}. Get both above 80% to move up.`;
    const rt = sc.meanRt === null ? 'no answers in time' : `${Math.round(sc.meanRt)} ms average answer`;
    $('[data-detail]').textContent =
      `${sc.hits} of ${sc.targets} targets in time · ${sc.late} late · ` +
      `${sc.fas} of ${sc.lures} other signs answered · d′ ${sc.dprime.toFixed(2)} · ${rt}`;
    const w = SW.windowMs(store.signLevel), dw = w - before.window;
    $('[data-next-window]').textContent = `${w} ms` + (dw === 0 ? ' (same)' : dw < 0 ? ` (${-dw} ms shorter)` : ` (${dw} ms longer)`);
    const dr = store.roadLevel - before.road;
    $('[data-next-road]').textContent = `${store.roadLevel}` + (dr === 0 ? ' (same)' : ` (${signed(dr)})`);
  }

  function paintInputMode(mode) {
    const words = {
      keys: { respond: 'press <kbd>Space</kbd>', ready: 'Or press <kbd>Space</kbd> when you’re ready.', next: 'Or press <kbd>Space</kbd>.', drive: '<kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>' },
      pad: { respond: 'press A or the right trigger', ready: 'Or press A when you’re ready.', next: 'Or press A.', drive: 'The left stick' },
      touch: { respond: 'tap the right half of the screen', ready: '', next: '', drive: 'Hold the left half of the screen and drag' }
    }[mode];
    // these strings are all fixed above, so innerHTML is safe
    $$('.k-respond').forEach(el => { el.innerHTML = words.respond; });
    $$('.k-respond-cap').forEach(el => { el.innerHTML = cap(words.respond); });
    $$('.k-ready').forEach(el => { el.innerHTML = words.ready; });
    $$('.k-next').forEach(el => { el.innerHTML = words.next; });
    $$('.k-drive').forEach(el => { el.innerHTML = words.drive; });
    if (state === 'play') touch.hidden = mode !== 'touch';
  }

  // ---------- wiring ----------
  const actions = {
    start, go, resume, next, pause,
    menu: toMenu,
    quit: toMenu,
    continue: toBrief,
    about() { setState('about'); },
    back() { setState('menu'); },
    how(btn) {
      const how = $('#how');
      how.hidden = !how.hidden;
      btn.setAttribute('aria-expanded', String(!how.hidden));
    },
    reset() {
      if (!confirm('Reset your levels and run history? This can’t be undone.')) return;
      store = SW.store.reset();
      SW.store.save(store);
      world = makeWorld(store.roadLevel, newSeed());
      paintMenu();
    }
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const fn = actions[btn.dataset.action];
    if (fn) fn(btn);
  });

  function handle(events) {
    for (const e of events) {
      if (e.type === 'respond') {
        if (state === 'play') respond(e.t);
        else if (state === 'brief') go();
        else if (state === 'results') next();
        else if (state === 'fact') toBrief();
        else if (state === 'paused') resume();
        else if (state === 'menu') start();
      } else if (e.type === 'pause') {
        if (state === 'play') pause(); else if (state === 'paused') resume();
      } else if (e.type === 'back') {
        if (state === 'play') pause();
        else if (state === 'paused') resume();
        else if (state === 'brief' || state === 'results' || state === 'count') toMenu();
        else if (state === 'fact') toBrief();
        else if (state === 'about') setState('menu');
      }
    }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('blur', () => pause());
  let resizeQueued = false;
  addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; renderer.resize(); });
  });

  input.onMode = paintInputMode;
  buildCars();
  paintMenu();
  paintInputMode(input.mode);
  setState('menu');

  // ---------- the loop ----------
  let last = performance.now();

  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, raw);
    last = now;

    input.update(dt);
    handle(input.take());

    const idle = state === 'menu' || state === 'about';
    if (state === 'play') updatePlay(now, dt);
    else if (state === 'count') updateCount(now);
    else if (idle && !reduced) stepWorld(world, dt, 0, 0, true);

    let sign = null;
    if (run && (state === 'play' || state === 'paused') && run.current >= 0) {
      const s = run.signs[run.current];
      if ((run.t - s.shownAt) * 1000 < P.signMs) sign = s.kind;
    }
    renderer.draw({
      world,
      car: SW.CAR[store.car],
      sign,
      flash: state === 'play' && run.flash && now < run.flash.until ? run.flash : null,
      shake: (state === 'play' || state === 'paused') && !world.onRoad,
      showBox: true,
      showCross: !idle,
      reduced,
      time: now / 1000,
      dt: state === 'play' || idle ? dt : 0,
      exhaust: state === 'play' || state === 'count' || idle
    });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For tests and the curious: window.SW.debug
  SW.debug = { get state() { return state; }, get run() { return run; }, get world() { return world; }, get store() { return store; }, actions };
})(window.SW);
