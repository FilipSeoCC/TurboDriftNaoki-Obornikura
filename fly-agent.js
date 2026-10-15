/*
 * FlyAgent — pojedyncza „mucha” (mózg + sterowanie) dla gry.
 * Mózg liczy się w Web Workerze (fly-brain-worker.js); gdy Worker się nie uda (stary
 * przeglądarki, CSP, błąd ładowania), przechodzi na liczenie w głównym wątku.
 *
 *   var agent = new FlyAgent(circuit, seed);
 *   agent.update(dtSec, perception)  → ostatnie sterowanie { steer, handbrake, throttle, ... }
 *   agent.wantSnapshot = true        → agent.last / agent.now (ślad impulsów do panelu mózgu)
 *   agent.reset(seed) / agent.destroy()
 *
 * Worker odpowiada z opóźnieniem ~1 klatki. Gdy nie nadąża, ms symulacji się kumulują
 * (maks. 100 ms na wiadomość), więc gra nigdy nie czeka na mózg.
 */
(function (root) {
  'use strict';
  var shared = null, nextId = 1, failed = false;

  function getWorker() {
    if (shared || failed || typeof Worker === 'undefined') return shared;
    try {
      shared = new Worker('fly-brain-worker.js');
      shared.handlers = {};
      shared.onmessage = function (e) { var h = shared.handlers[e.data.id]; if (h) h(e.data); };
      shared.onerror = function () { failAll(); };
    } catch (err) { failed = true; shared = null; }
    return shared;
  }
  var agents = {};
  function failAll() {
    failed = true;
    if (shared) { try { shared.terminate(); } catch (e) {} shared = null; }
    for (var k in agents) agents[k]._fallback();
  }

  function FlyAgent(circuit, seed) {
    this.id = nextId++; this.circuit = circuit; this.n = circuit.n;
    this.rates = {}; FlyBrain.OUTPUTS.forEach(function (k, i, a) { this.rates[k] = 0; }, this);
    this.motor = FlyBrain.motor(this.rates);
    this.spikeRate = 0; this.now = 0; this.last = null;
    this.wantSnapshot = false;
    this.acc = 0; this.pending = 0; this.snapEvery = 0; this.inline = null; this.dead = false;
    agents[this.id] = this;
    var w = getWorker(), self = this;
    if (w) {
      w.handlers[this.id] = function (m) { self._onMsg(m); };
      w.postMessage({ t: 'init', id: this.id, circuit: circuit, seed: seed });
    } else { this._fallback(seed); }
    this._seed = seed;
  }

  FlyAgent.prototype._fallback = function (seed) {
    if (this.inline) return;
    this.inline = new FlyBrain(this.circuit, seed != null ? seed : this._seed);
    this.pending = 0; this.acc = 0;
  };

  FlyAgent.prototype._onMsg = function (m) {
    if (this.dead) return;
    if (m.t === 'error') { failAll(); return; }
    if (m.t !== 'out') return;
    this.pending = Math.max(0, this.pending - 1);
    this.rates = m.rates; this.spikeRate = m.spikeRate; this.now = m.now;
    if (m.last) this.last = m.last;
    this.motor = FlyBrain.motor(m.rates);
  };

  FlyAgent.prototype.update = function (dt, perception) {
    if (this.dead) return this.motor;
    if (this.inline) {
      var r = this.inline.run(dt * 1000, perception);
      this.rates = r; this.spikeRate = this.inline.spikeRate; this.now = this.inline.nowMs();
      if (this.wantSnapshot) this.last = this.inline.lastSpike;
      this.motor = FlyBrain.motor(r);
      return this.motor;
    }
    this.acc += dt * 1000;
    if (this.pending < 2 && shared) {
      var snap = this.wantSnapshot && (this.snapEvery++ % 3 === 0);
      shared.postMessage({ t: 'step', id: this.id, ms: Math.min(this.acc, 100), inputs: perception, snap: snap });
      this.acc = Math.max(0, this.acc - 100); this.pending++;
    } else if (this.acc > 400) this.acc = 400; // nie goń w nieskończoność
    return this.motor;
  };

  FlyAgent.prototype.reset = function (seed) {
    this._seed = seed; this.acc = 0; this.pending = 0;
    FlyBrain.OUTPUTS.forEach(function (k) { this.rates[k] = 0; }, this);
    this.motor = FlyBrain.motor(this.rates); this.last = null;
    if (this.inline) this.inline.reset(seed);
    else if (shared) shared.postMessage({ t: 'reset', id: this.id, seed: seed });
  };

  FlyAgent.prototype.destroy = function () {
    this.dead = true; delete agents[this.id];
    if (shared) { delete shared.handlers[this.id]; shared.postMessage({ t: 'drop', id: this.id }); }
    this.inline = null;
  };

  FlyAgent.prototype.usesWorker = function () { return !this.inline; };

  if (typeof module !== 'undefined' && module.exports) module.exports = FlyAgent;
  else root.FlyAgent = FlyAgent;
})(typeof window !== 'undefined' ? window : this);
