/*
 * Wątek mózgu muchy. Liczy symulację LIF poza głównym wątkiem, żeby 1926 neuronów
 * nie zabierało czasu klatkom gry (rysowanie, fizyka, dźwięk).
 *
 * Protokół (postMessage):
 *   → { t:'init', id, circuit, seed }            tworzy mózg (id = numer mózgu, pozwala mieć kilka)
 *   → { t:'step', id, ms, inputs, snap }          symuluje `ms` ms przy stałych wejściach (Hz)
 *   → { t:'reset', id, seed } / { t:'drop', id }
 *   ← { t:'ready', id }
 *   ← { t:'out', id, rates, spikeRate, now, last? }   `last` (Float32Array) tylko gdy snap=true
 */
importScripts('fly-brain.js');
(function () {
  'use strict';
  var brains = {};
  self.onmessage = function (e) {
    var m = e.data;
    if (m.t === 'init') {
      try { brains[m.id] = new FlyBrain(m.circuit, m.seed); self.postMessage({ t: 'ready', id: m.id }); }
      catch (err) { self.postMessage({ t: 'error', id: m.id, message: String(err && err.message || err) }); }
    } else if (m.t === 'step') {
      var b = brains[m.id]; if (!b) return;
      var rates = b.run(Math.min(m.ms, 100), m.inputs);
      var out = { t: 'out', id: m.id, rates: Object.assign({}, rates), spikeRate: b.spikeRate, now: b.nowMs() };
      if (m.snap) out.last = b.lastSpike.slice();
      self.postMessage(out, out.last ? [out.last.buffer] : []);
    } else if (m.t === 'reset') {
      if (brains[m.id]) brains[m.id].reset(m.seed);
    } else if (m.t === 'drop') {
      delete brains[m.id];
    }
  };
})();
