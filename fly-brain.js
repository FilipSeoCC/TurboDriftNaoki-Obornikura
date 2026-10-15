/*
 * Mucha za kierownicą — silnik mózgu muchy owocówki (Drosophila melanogaster).
 *
 * Symuluje wycięty z konektomu FlyWire (v783) obwód „wzrok → skręt / ucieczka”:
 * 1926 prawdziwych neuronów i ich połączenia 1:1 z mikroskopii elektronowej.
 * Model neuronu (leaky integrate-and-fire) i parametry są takie same jak w
 * Shiu et al. 2024 (Nature) — bez treningu i bez ręcznego strojenia wag.
 * Jak powstał obwód: docs/MUCHA.md, skrypt: tools/fly/extract_circuit.py.
 *
 * Działa w przeglądarce (window.FlyBrain) i w Node (require) — do testów.
 */
(function (root) {
  'use strict';

  function b64ToBytes(s) {
    if (typeof atob === 'function') {
      var bin = atob(s), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }

  // Grupy wejściowe (bodźce z gry) i wyjściowe (neurony zstępujące → sterowanie).
  var INPUTS = ['tgtL', 'tgtR', 'loomL', 'loomR'];
  var OUTPUTS = ['DNa01_left', 'DNa01_right', 'DNa02_left', 'DNa02_right',
    'DNp01_left', 'DNp01_right', 'MDN_left', 'MDN_right'];

  function FlyBrain(circuit, seed) {
    var p = circuit.params;
    this.circuit = circuit;
    this.n = circuit.n;
    this.dt = 0.1; // ms — krok całkowania jak w oryginalnym modelu
    this.rowptr = new Uint32Array(b64ToBytes(circuit.rowptr).buffer);
    this.post = new Uint16Array(b64ToBytes(circuit.post).buffer);
    this.w = new Int16Array(b64ToBytes(circuit.w).buffer);
    this.v0 = p.v0; this.vrst = p.vrst; this.vth = p.vth;
    this.kMem = this.dt / p.tm;
    this.decG = Math.exp(-this.dt / p.tau);
    this.trf = p.trf;
    this.wsyn = p.wsyn;
    this.wpoi = p.wsyn * p.fpoi;
    this.delay = Math.round(p.dly / this.dt) + 1;
    this.v = new Float32Array(this.n).fill(p.v0);
    this.g = new Float32Array(this.n);
    this.ref = new Float32Array(this.n);
    // ring buffer of spikes waiting out the synaptic delay
    this.ring = [];
    for (var i = 0; i < this.delay; i++) this.ring.push([]);
    this.t = 0; // steps
    this.inputs = {}; this.outputs = {};
    var self = this;
    INPUTS.forEach(function (k) { self.inputs[k] = Int32Array.from(circuit.inputs[k]); });
    OUTPUTS.forEach(function (k) { self.outputs[k] = Int32Array.from(circuit.outputs[k]); });
    this.isOutput = new Int8Array(this.n).fill(-1);
    OUTPUTS.forEach(function (k, oi) { self.outputs[k].forEach(function (ix) { self.isOutput[ix] = oi; }); });
    this.outSpikes = new Float64Array(OUTPUTS.length);
    this.rates = {}; OUTPUTS.forEach(function (k) { self.rates[k] = 0; });
    this.lastSpike = new Float32Array(this.n).fill(-1e9); // ms, do wizualizacji
    this.spikesLastStep = 0;
    this._s = (seed >>> 0) || 123456789;
  }

  FlyBrain.prototype.rand = function () { // xorshift32 — szybkie i powtarzalne w testach
    var s = this._s; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; this._s = s;
    return s / 4294967296;
  };

  /** Symuluje `ms` milisekund mózgu przy stałych częstotliwościach wejść (Hz). */
  FlyBrain.prototype.run = function (ms, inputRates) {
    var steps = Math.max(1, Math.round(ms / this.dt));
    var n = this.n, v = this.v, g = this.g, ref = this.ref, rowptr = this.rowptr, post = this.post, w = this.w;
    var dt = this.dt, kMem = this.kMem, decG = this.decG, v0 = this.v0, vth = this.vth, vrst = this.vrst;
    var counts = new Float64Array(this.outSpikes.length), spikeTotal = 0;
    var pIn = {}, k;
    for (k in this.inputs) pIn[k] = Math.max(0, (inputRates && inputRates[k]) || 0) * dt / 1000;
    for (var s = 0; s < steps; s++) {
      var slot = this.t % this.delay;
      var arrived = this.ring[slot];
      for (var a = 0; a < arrived.length; a++) {
        var pre = arrived[a];
        for (var e = rowptr[pre], end = rowptr[pre + 1]; e < end; e++) g[post[e]] += w[e] * this.wsyn;
      }
      for (k in pIn) {
        var pr = pIn[k]; if (!pr) continue;
        var idx = this.inputs[k];
        for (var j = 0; j < idx.length; j++) if (this.rand() < pr) g[idx[j]] += this.wpoi;
      }
      var fired = [];
      var nowMs = this.t * dt;
      for (var i = 0; i < n; i++) {
        if (ref[i] > 0) { ref[i] -= dt; continue; }
        v[i] += (v0 - v[i] + g[i]) * kMem;
        g[i] *= decG;
        if (v[i] > vth) {
          v[i] = vrst; g[i] = 0; ref[i] = this.trf;
          fired.push(i); this.lastSpike[i] = nowMs;
          var oi = this.isOutput[i]; if (oi >= 0) counts[oi]++;
        }
      }
      spikeTotal += fired.length;
      this.ring[slot] = fired;
      this.t++;
    }
    // Wygładzone częstotliwości wyjść (Hz) — stała czasowa ~150 ms.
    var simMs = steps * dt, alpha = 1 - Math.exp(-simMs / 150);
    for (var o = 0; o < OUTPUTS.length; o++) {
      var name = OUTPUTS[o];
      var hz = counts[o] / this.outputs[name].length / (simMs / 1000);
      this.rates[name] += (hz - this.rates[name]) * alpha;
    }
    this.spikesLastStep = spikeTotal;
    return this.rates;
  };

  FlyBrain.prototype.nowMs = function () { return this.t * this.dt; };

  // ---------------- percepcja: świat gry → bodźce wzrokowe muchy ----------------
  // LC10a: neurony wzrokowe „mały obiekt w polu widzenia” (u samców — pościg za samicą).
  //   Czerwona linia przed autem = obiekt; z lewej pobudza LC10a lewej półkuli itd.
  // LPLC2 + LC4: detektory „coś na mnie leci” (looming). Zbliżający się mur z lewej/prawej.
  var TGT_MAX = 90;   // Hz — powyżej ~120 Hz obwód LC10a sam się hamuje (sprawdzone w symulacji)
  var LOOM_MAX = 140; // Hz
  var LOOM_RANGE = 140; // px — od tej odległości mur zaczyna „nadlatywać”

  function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  function rayToWall(x, y, ang, W, H, margin) {
    var dx = Math.cos(ang), dy = Math.sin(ang), t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (W - margin - x) / dx);
    if (dx < -1e-6) t = Math.min(t, (margin - x) / dx);
    if (dy > 1e-6) t = Math.min(t, (H - margin - y) / dy);
    if (dy < -1e-6) t = Math.min(t, (margin - y) / dy);
    return Math.max(0, t);
  }

  /**
   * car: {x,y,angle,speed}; target: {x,y} punkt na linii przed autem.
   * Zwraca częstotliwości wejść (Hz) + dane do wizualizacji.
   */
  function perceive(car, target, W, H, margin) {
    var bearing = wrapAngle(Math.atan2(target.y - car.y, target.x - car.x) - car.angle);
    // y rośnie w dół: bearing < 0 → cel po lewej stronie maski
    var side = Math.max(-1, Math.min(1, bearing / (Math.PI / 3)));
    var tgtL = side < 0 ? TGT_MAX * Math.min(1, 0.25 + 0.75 * -side) : 0;
    var tgtR = side > 0 ? TGT_MAX * Math.min(1, 0.25 + 0.75 * side) : 0;
    if (Math.abs(side) < 0.06) { tgtL = tgtR = 0; } // prosto na celu — nic nie świeci z boku
    var dL = rayToWall(car.x, car.y, car.angle - 0.6, W, H, margin);
    var dR = rayToWall(car.x, car.y, car.angle + 0.6, W, H, margin);
    function loom(d) { var u = Math.max(0, (LOOM_RANGE - d) / LOOM_RANGE); return LOOM_MAX * u * u; }
    return { tgtL: tgtL, tgtR: tgtR, loomL: loom(dL), loomR: loom(dR), bearing: bearing, wallL: dL, wallR: dR };
  }

  // ---------------- motoryka: neurony zstępujące → pedały i kierownica ----------------
  // DNa02 / DNa01 — u prawdziwej muchy skręcają w swoją stronę (Rayshubskiy i in. 2020).
  // DNp01 — „giant fiber”, odruch ucieczki (skok) → HYDROŁAPA.
  // MDN — „moonwalker”, cofanie → mucha odpuszcza gaz.
  var STEER_GAIN = 1 / 30; // Hz różnicy → pełny skręt
  function motor(rates) {
    var left = rates.DNa02_left + 0.6 * rates.DNa01_left;
    var right = rates.DNa02_right + 0.6 * rates.DNa01_right;
    var steer = Math.max(-1, Math.min(1, (right - left) * STEER_GAIN));
    var gf = rates.DNp01_left + rates.DNp01_right;
    var mdn = (rates.MDN_left + rates.MDN_right) / 2;
    return {
      steer: steer,
      handbrake: gf > 260 ? 1 : 0,
      throttle: mdn > 4 ? 0 : 1,
      turnLeft: left, turnRight: right, giantFiber: gf, moonwalker: mdn
    };
  }

  FlyBrain.INPUTS = INPUTS;
  FlyBrain.OUTPUTS = OUTPUTS;
  FlyBrain.perceive = perceive;
  FlyBrain.motor = motor;

  if (typeof module !== 'undefined' && module.exports) module.exports = FlyBrain;
  else root.FlyBrain = FlyBrain;
})(typeof window !== 'undefined' ? window : this);
