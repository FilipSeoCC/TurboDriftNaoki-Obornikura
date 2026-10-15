/*
 * RivalCar — auto muchy-przeciwnika. Ta sama fizyka i ta sama punktacja co `updateDrift`
 * gracza w index.html (ruch z poślizgiem, ściany, wzór punktów, strefy x2), ale bez
 * audio, canvasu i globali, więc można go uruchomić w Node i przetestować.
 *
 * Różnice względem gracza (celowe): brak przypadkowej awarii silnika, stożki nie liczą się,
 * pętle nie dają punktów (u gracza też wpływają tylko na „wkurw”). Czas liczy własnym zegarem.
 *
 *   var car = new RivalCar({ w, h, margin, path, bonusZones, stats, start:{x,y,angle} });
 *   car.step(dtSec, { steer:-1..1, throttle:0..1, handbrake:0|1 });
 *   car.state, car.getTarget()
 */
(function (root) {
  'use strict';
  var DRIFT_MIN_SPEED = 40;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function RivalCar(o) {
    this.w = o.w; this.h = o.h; this.margin = o.margin == null ? 26 : o.margin;
    this.path = o.path || []; this.bonusZones = o.bonusZones || [];
    this.stats = o.stats; this.start = o.start || { x: this.w / 2, y: this.h - 80, angle: -Math.PI / 2 };
    this.reset();
  }

  RivalCar.prototype.reset = function () {
    var s = this.start;
    this.t = 0; this.score = 0; this.heat = 0;
    this.x = s.x; this.y = s.y; this.angle = s.angle; this.vx = 0; this.vy = 0; this.speed = 0;
    this.wheelSpin = 0; this.throttle = 0; this.driftAmt = 0; this.slideAngle = 0; this.lineQuality = 0;
    this.wallHitAt = -9999; this.wallHits = 0; this.hitWallThisStep = false;
    this.bonusZone = -1; this.bonusUntil = 0; this.nearIndex = 0;
    if (this.path.length) this.nearIndex = this._nearest().index;
    this.state = this._snapshot();
  };

  /** Najbliższy punkt na czerwonej linii (ta sama geometria co nearestPathPoint w grze). */
  RivalCar.prototype._nearest = function () {
    var path = this.path, n = path.length, x = this.x, y = this.y, best = Infinity, bi = 0;
    for (var i = 0; i < n; i++) {
      var a = path[i], b = path[(i + 1) % n];
      var vx = b.x - a.x, vy = b.y - a.y, wx = x - a.x, wy = y - a.y, len2 = vx * vx + vy * vy;
      var u = len2 ? clamp((wx * vx + wy * vy) / len2, 0, 1) : 0;
      var dx = x - (a.x + vx * u), dy = y - (a.y + vy * u), d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { best = d; bi = i; }
    }
    return { dist: best, index: bi };
  };

  RivalCar.prototype.step = function (dt, motor) {
    var st = this.stats, steer = motor.steer || 0, throttle = motor.throttle ? motor.throttle : 0, handbrake = motor.handbrake ? 1 : 0;
    this.t += dt * 1000; this.throttle = throttle;
    var maxSpeed = st.maxSpeed;
    var decel = throttle ? 0 : (handbrake ? 50 : st.decel);
    var lowSpeedBoost = 1 + (st.turbo * 0.055) * (1 - this.speed / maxSpeed) + (st.supercharger * 0.025);
    this.speed = clamp(this.speed + (throttle ? st.accel * lowSpeedBoost * dt : -decel * dt), 0, maxSpeed);
    var gripRate = handbrake ? 1.1 : st.grip;
    var blend = 1 - Math.exp(-gripRate * dt);
    var turnRate = (1.05 + this.speed / maxSpeed) * (handbrake ? 1.85 : 1.3) * st.turn;
    this.angle += steer * turnRate * dt;
    this.vx += (Math.cos(this.angle) * this.speed - this.vx) * blend;
    this.vy += (Math.sin(this.angle) * this.speed - this.vy) * blend;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.wheelSpin += this.speed * dt * 0.1;

    var m = this.margin, hit = false;
    if (this.x < m) { this.x = m; this.vx *= -0.4; this.speed *= 0.7; hit = true; }
    if (this.x > this.w - m) { this.x = this.w - m; this.vx *= -0.4; this.speed *= 0.7; hit = true; }
    if (this.y < m) { this.y = m; this.vy *= -0.4; this.speed *= 0.7; hit = true; }
    if (this.y > this.h - m) { this.y = this.h - m; this.vy *= -0.4; this.speed *= 0.7; hit = true; }
    this.hitWallThisStep = false;
    if (hit && this.t - this.wallHitAt > 700) {
      this.wallHitAt = this.t; this.wallHits++; this.hitWallThisStep = true;
      this.score = Math.floor(this.score / 2);
    }

    var moveAngle = Math.atan2(this.vy, this.vx);
    var diff = Math.atan2(Math.sin(this.angle - moveAngle), Math.cos(this.angle - moveAngle));
    var driftAmt = clamp(Math.abs(diff) / 1.4, 0, 1);
    this.slideAngle = diff; this.driftAmt = driftAmt;
    var isDrifting = this.speed > DRIFT_MIN_SPEED && driftAmt > 0.12;
    this.heat = clamp(this.heat - dt * 6, 0, 100);
    if (isDrifting) this.heat = clamp(this.heat + dt * 6, 0, 100);

    var near = this._nearest();
    this.nearIndex = near.index;
    var lineQuality = clamp(1 - near.dist / 58, 0, 1);
    var speedQuality = clamp((this.speed - DRIFT_MIN_SPEED) / (maxSpeed - DRIFT_MIN_SPEED), 0, 1);
    var slideQuality = clamp((driftAmt - 0.12) / 0.58, 0, 1);
    var onLine = isDrifting && lineQuality > 0;
    var active = -1;
    if (onLine) {
      for (var i = 0; i < this.bonusZones.length; i++) {
        var z = this.bonusZones[i], zx = this.x - z.x, zy = this.y - z.y;
        if (zx * zx + zy * zy < z.radius * z.radius) active = i;
      }
    }
    if (active !== -1 && this.bonusZone !== active) this.bonusUntil = this.t + 3500;
    this.bonusZone = active;
    var bonus = this.t < this.bonusUntil ? 2 : 1;
    this.lineQuality = onLine ? lineQuality : 0;
    if (onLine) {
      this.score += (5 + 38 * speedQuality * slideQuality) * lineQuality * lineQuality * bonus * dt;
      this.heat = clamp(this.heat + dt * (4 + lineQuality * 7), 0, 100);
    }
    this.state = this._snapshot();
    return this.state;
  };

  RivalCar.prototype._snapshot = function () {
    return {
      x: this.x, y: this.y, angle: this.angle, speed: this.speed, score: this.score,
      driftAmt: this.driftAmt, slideAngle: this.slideAngle, heat: this.heat, lineQuality: this.lineQuality,
      wallHits: this.wallHits, wallCooldownUntil: this.wallHitAt + 700, bonusUntil: this.bonusUntil,
      bonusActive: this.t < this.bonusUntil, wheelSpin: this.wheelSpin, throttle: this.throttle,
      hitWallThisStep: this.hitWallThisStep
    };
  };

  /** Punkt na linii przed maską — to, co mucha „widzi” (jak flyLookaheadPoint gracza). */
  RivalCar.prototype.getTarget = function () {
    var path = this.path, n = path.length;
    if (!n) return { x: this.x, y: this.y };
    var want = 70 + this.speed * 0.3, acc = 0, i = this.nearIndex;
    for (var s = 0; s < n && acc < want; s++) {
      var a = path[i], b = path[(i + 1) % n];
      acc += Math.hypot(b.x - a.x, b.y - a.y); i = (i + 1) % n;
    }
    return path[i];
  };

  RivalCar.DRIFT_MIN_SPEED = DRIFT_MIN_SPEED;
  if (typeof module !== 'undefined' && module.exports) module.exports = RivalCar;
  else root.RivalCar = RivalCar;
})(typeof window !== 'undefined' ? window : this);
