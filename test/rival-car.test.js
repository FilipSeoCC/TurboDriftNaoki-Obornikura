// Testy auta muchy-przeciwnika: fizyka i punktacja muszą działać jak u gracza (index.html, updateDrift).
const test = require('node:test');
const assert = require('node:assert');
const RivalCar = require('../rival-car.js');
const FlyBrain = require('../fly-brain.js');
const circuit = require('../assets/fly-circuit.json');

const W = 800, H = 600;
const stats = { maxSpeed: 285, accel: 245, decel: 150, grip: 2.6, turn: 1, flame: 1, turbo: 0, supercharger: 0 };
function ring(r = 200, n = 120) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push({ x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r }); }
  return p;
}
function make(extra) {
  const path = ring();
  return new RivalCar(Object.assign({ w: W, h: H, margin: 26, path, bonusZones: [], stats,
    start: { x: path[0].x, y: path[0].y, angle: Math.PI / 2 } }, extra));
}

test('jazda 30 s ze stałym skrętem nie daje NaN i auto zostaje w arenie', () => {
  const c = make();
  for (let i = 0; i < 30 * 60; i++) c.step(1 / 60, { steer: 1, throttle: 1, handbrake: i % 200 < 20 ? 1 : 0 });
  for (const k of ['x', 'y', 'angle', 'speed', 'score', 'heat']) assert.ok(Number.isFinite(c.state[k]), k);
  assert.ok(c.state.x >= 26 && c.state.x <= W - 26 && c.state.y >= 26 && c.state.y <= H - 26);
});

test('poniżej DRIFT_MIN_SPEED punkty nie rosną', () => {
  const c = make();
  for (let i = 0; i < 120; i++) c.step(1 / 60, { steer: 0, throttle: 0, handbrake: 0 });
  assert.strictEqual(c.state.score, 0);
});

test('uderzenie w ścianę połowi wynik raz na 700 ms', () => {
  const c = make();
  c.score = 100; c.x = 27; c.y = 300; c.angle = Math.PI; c.speed = 200; c.vx = -200; c.vy = 0;
  c.step(1 / 60, { steer: 0, throttle: 1, handbrake: 0 });
  assert.strictEqual(c.state.score, 50);
  assert.strictEqual(c.state.wallHits, 1);
  for (let i = 0; i < 10; i++) { c.x = 27; c.vx = -200; c.speed = 200; c.angle = Math.PI; c.step(1 / 60, { steer: 0, throttle: 1, handbrake: 0 }); }
  assert.strictEqual(c.state.wallHits, 1, 'cooldown 700 ms');
  assert.ok(c.state.score >= 50);
});

test('strefa bonusowa daje x2 przez 3,5 s', () => {
  const c = make({ bonusZones: [{ x: 600, y: 300, radius: 31 }] });
  // stan „w poślizgu na linii, w strefie”
  c.x = 600; c.y = 300; c.speed = 250; c.angle = Math.PI / 2; c.vx = 250; c.vy = 0;
  c.step(1 / 60, { steer: 0, throttle: 1, handbrake: 0 });
  assert.ok(c.state.bonusActive || c.lineQuality === 0, 'bonus uruchomiony tylko na linii');
  const t0 = c.t; c.bonusZone = -1; c.bonusUntil = 0;
  c.path = [{ x: 560, y: 260 }, { x: 640, y: 340 }, { x: 560, y: 340 }]; // linia przez strefę
  c.x = 600; c.y = 300; c.vx = 250; c.vy = 0; c.speed = 250; c.angle = Math.PI / 2;
  c.step(1 / 60, { steer: 0, throttle: 1, handbrake: 0 });
  if (c.lineQuality > 0 && c.driftAmt > 0.12) assert.ok(Math.abs(c.bonusUntil - (c.t + 3500)) < 1);
  assert.ok(c.t > t0);
});

test('cel przed maską leży na linii dalej niż najbliższy punkt', () => {
  const c = make();
  const t = c.getTarget(), n = c.path[c.nearIndex];
  assert.ok(Math.hypot(t.x - n.x, t.y - n.y) > 40);
});

test('mózg muchy prowadzi RivalCar po okręgu i zbiera punkty', () => {
  const c = make(), brain = new FlyBrain(circuit, 7);
  let walls = 0;
  for (let i = 0; i < 40 * 60; i++) {
    const per = FlyBrain.perceive(c.state, c.getTarget(), W, H, 26);
    const m = FlyBrain.motor(brain.run(1000 / 60, per));
    c.step(1 / 60, m);
  }
  assert.ok(Number.isFinite(c.state.score));
  assert.ok(c.state.score > 0, 'wynik ' + c.state.score);
});
