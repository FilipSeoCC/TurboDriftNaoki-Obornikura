/*
 * Mucha — silnik mózgu muchy owocówki (Drosophila melanogaster).
 *
 * Symuluje wycięty z konektomu FlyWire (v783) obwód „wzrok → skręt / ucieczka”:
 * 1926 prawdziwych neuronów i ich połączenia 1:1 z mikroskopii elektronowej.
 * Model neuronu (leaky integrate-and-fire) i parametry są takie same jak w
 * Shiu et al. 2024 (Nature) — bez treningu i bez ręcznego strojenia wag.
 * Jak powstał obwód: docs/MUCHA.md, skrypt: tools/fly/extract_circuit.py.
 *
 * Wydajność: neurony w spoczynku (zerowy prąd, potencjał spoczynkowy) są pomijane jednym
 * porównaniem, losowe impulsy wejściowe losujemy jako liczbę zdarzeń na krok (a nie osobno dla
 * każdego neuronu), a bufory impulsów są typowane (zero alokacji w pętli).
 * W przeglądarce silnik pracuje w osobnym wątku (fly-brain-worker.js + fly-agent.js).
 *
 * Działa w przeglądarce (window.FlyBrain), w workerze (self.FlyBrain) i w Node (require).
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
  var EPS = 1e-5; // mV — poniżej tego wygaszamy ogon zaniku (unika liczb zdenormalizowanych)

  function FlyBrain(circuit, seed) {
    var p = circuit.params, n = circuit.n, self = this;
    this.n = n;
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
    this.inputs = {}; this.outputs = {};
    INPUTS.forEach(function (k) { self.inputs[k] = Int32Array.from(circuit.inputs[k]); });
    OUTPUTS.forEach(function (k) { self.outputs[k] = Int32Array.from(circuit.outputs[k]); });
    this.isOutput = new Int8Array(n).fill(-1);
    OUTPUTS.forEach(function (k, oi) { self.outputs[k].forEach(function (ix) { self.isOutput[ix] = oi; }); });
    this.v = new Float32Array(n);
    this.g = new Float32Array(n);
    this.ref = new Float32Array(n);
    this.ringBuf = []; this.ringCnt = new Int32Array(this.delay);
    for (var i = 0; i < this.delay; i++) this.ringBuf.push(new Int32Array(n)); // impulsy czekające na dotarcie
    this.lastSpike = new Float32Array(n); // ms czasu symulacji, do wizualizacji
    this.tmpCounts = new Float64Array(OUTPUTS.length);
    this.rates = {}; OUTPUTS.forEach(function (k) { self.rates[k] = 0; });
    this.reset(seed);
  }

  /** Wraca do stanu spoczynku (np. przy restarcie przejazdu), bez ponownego dekodowania obwodu. */
  FlyBrain.prototype.reset = function (seed) {
    this.v.fill(this.v0); this.g.fill(0); this.ref.fill(0);
    this.t = 0;
    for (var i = 0; i < this.delay; i++) this.ringCnt[i] = 0;
    this.lastSpike.fill(-1e9);
    for (var k in this.rates) this.rates[k] = 0;
    this.spikesLastStep = 0; this.spikeRate = 0;
    this._s = (seed >>> 0) || 123456789;
  };

  /** Symuluje `ms` milisekund mózgu przy stałych częstotliwościach wejść (Hz). */
  FlyBrain.prototype.run = function (ms, inputRates) {
    var dt = this.dt, steps = Math.max(1, Math.round(ms / dt)), n = this.n;
    var v = this.v, g = this.g, ref = this.ref;
    var rowptr = this.rowptr, post = this.post, w = this.w, wsyn = this.wsyn, wpoi = this.wpoi;
    var delay = this.delay, ringBuf = this.ringBuf, ringCnt = this.ringCnt;
    var v0 = this.v0, vth = this.vth, vrst = this.vrst, kMem = this.kMem, decG = this.decG, trf = this.trf;
    var lastSpike = this.lastSpike, isOutput = this.isOutput, counts = this.tmpCounts;
    counts.fill(0);
    // Wejścia: w jednym kroku grupa N neuronów dostaje Poisson(N·p) impulsów w losowych neuronach
    // (statystycznie to samo co niezależny rzut monetą dla każdego, ale ~50x mniej losowań).
    var inIdx = [], inP0 = [], inLam = [], name;
    for (name in this.inputs) {
      var hz = inputRates && inputRates[name];
      if (hz > 0) {
        var lam = this.inputs[name].length * hz * dt / 1000;
        inIdx.push(this.inputs[name]); inLam.push(lam); inP0.push(Math.exp(-lam));
      }
    }
    var s32 = this._s, spikeTotal = 0, t = this.t;
    for (var s = 0; s < steps; s++, t++) {
      var slot = t % delay, buf = ringBuf[slot], cnt = ringCnt[slot], a, e, end, j, k, i;
      // 1) impulsy sprzed `delay` kroków docierają do synaps
      for (a = 0; a < cnt; a++) {
        var pre = buf[a];
        for (e = rowptr[pre], end = rowptr[pre + 1]; e < end; e++) g[post[e]] += w[e] * wsyn;
      }
      // 2) losowe (Poissona) pobudzenie neuronów wejściowych
      for (k = 0; k < inIdx.length; k++) {
        var idx = inIdx[k], len = idx.length, p0 = inP0[k], cum = p0, term = p0, c = 0;
        s32 ^= s32 << 13; s32 >>>= 0; s32 ^= s32 >>> 17; s32 ^= s32 << 5; s32 >>>= 0; // xorshift32
        var u = s32 / 4294967296;
        while (u > cum && c < 12) { c++; term *= inLam[k] / c; cum += term; } // odwrócona dystrybuanta Poissona
        for (; c > 0; c--) {
          s32 ^= s32 << 13; s32 >>>= 0; s32 ^= s32 >>> 17; s32 ^= s32 << 5; s32 >>>= 0;
          g[idx[(s32 / 4294967296 * len) | 0]] += wpoi;
        }
      }
      // 3) całkowanie wszystkich neuronów (spoczynkowe pomijamy); nowe impulsy trafiają do tego samego slotu
      var nowMs = t * dt, out = 0;
      for (i = 0; i < n; i++) {
        if (ref[i] > 0) { ref[i] -= dt; continue; }
        var gi = g[i], vi = v[i];
        if (gi === 0 && vi === v0) continue;
        vi += (v0 - vi + gi) * kMem;
        gi *= decG;
        if (vi > vth) {
          v[i] = vrst; g[i] = 0; ref[i] = trf;
          buf[out++] = i; lastSpike[i] = nowMs;
          var oi = isOutput[i]; if (oi >= 0) counts[oi]++;
        } else {
          if (gi < EPS && gi > -EPS) { gi = 0; if (vi - v0 < EPS && v0 - vi < EPS) vi = v0; }
          v[i] = vi; g[i] = gi;
        }
      }
      ringCnt[slot] = out; spikeTotal += out;
    }
    this._s = s32; this.t = t;
    // Wygładzone częstotliwości wyjść (Hz) — stała czasowa ~150 ms.
    var simMs = steps * dt, alpha = 1 - Math.exp(-simMs / 150);
    for (var o = 0; o < OUTPUTS.length; o++) {
      var nm = OUTPUTS[o];
      var rate = counts[o] / this.outputs[nm].length / (simMs / 1000);
      this.rates[nm] += (rate - this.rates[nm]) * alpha;
    }
    this.spikesLastStep = spikeTotal;
    this.spikeRate = spikeTotal / (simMs / 1000);
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
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
