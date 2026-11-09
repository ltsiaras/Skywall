/* Skywall · store.js
   Levels and history live in this browser only (localStorage). The study
   carried each player's levels from one training day to the next; so do we.
   Every read and write is wrapped, so a private window still plays. */
(function (SW) {
  'use strict';

  const KEY = 'skywall.v1';

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  function fresh() {
    return {
      signLevel: SW.P.sign.start,
      roadLevel: SW.P.road.start,
      overall: 0,
      runs: 0,
      car: 'coupe',
      firstDay: today(),
      history: []
    };
  }

  SW.store = {
    load() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
      const base = fresh();
      if (!s || typeof s !== 'object') return base;
      const out = Object.assign(base, s);
      out.signLevel = SW.clamp(+out.signLevel || SW.P.sign.start, SW.P.sign.min, SW.P.sign.max);
      out.roadLevel = SW.clamp(+out.roadLevel || 0, SW.P.road.min, SW.P.road.max);
      if (!SW.CAR[out.car]) out.car = 'coupe';
      if (!Array.isArray(out.history)) out.history = [];
      return out;
    },
    save(s) {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: keep playing */ }
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      return fresh();
    },
    dayIndex(s) { return Math.max(0, daysBetween(s.firstDay || today(), today())); },
    today
  };
})(window.SW);
