// Testy trybu „Mucha za kierownicą”: czy wycięty obwód z konektomu FlyWire
// zachowuje odruchy, na których opiera się sterowanie (wartości z pełnej symulacji
// mózgu w docs/MUCHA.md). Mózg jest stochastyczny, więc progi są z zapasem.
const test = require('node:test');
const assert = require('node:assert');
const FlyBrain = require('../fly-brain.js');
const circuit = require('../assets/fly-circuit.json');

function settle(inputs, ms = 500, seed = 11) {
  const brain = new FlyBrain(circuit, seed);
  let rates;
  for (let t = 0; t < ms; t += 16) rates = brain.run(16, inputs);
  return { rates: Object.assign({}, rates), motor: FlyBrain.motor(rates) };
}

test('obwód ma oczekiwany rozmiar i grupy neuronów', () => {
  assert.strictEqual(circuit.n, 1926);
  for (const k of FlyBrain.INPUTS) assert.ok(circuit.inputs[k].length > 50, k);
  for (const k of FlyBrain.OUTPUTS) assert.ok(circuit.outputs[k].length >= 1, k);
  const brain = new FlyBrain(circuit, 1);
  assert.strictEqual(brain.rowptr[brain.n], brain.post.length);
});

test('bez bodźców mózg milczy, a auto jedzie prosto', () => {
  const { rates, motor } = settle({});
  for (const k of FlyBrain.OUTPUTS) assert.strictEqual(rates[k], 0, k);
  assert.strictEqual(motor.steer, 0);
  assert.strictEqual(motor.handbrake, 0);
  assert.strictEqual(motor.throttle, 1);
});

test('linia po lewej → pościg: skręt w lewo (DNa02 lewy)', () => {
  const { rates, motor } = settle({ tgtL: 90 });
  assert.ok(rates.DNa02_left > 25, 'DNa02_left ' + rates.DNa02_left);
  assert.ok(rates.DNa02_right < 5);
  assert.ok(motor.steer < -0.5, 'steer ' + motor.steer);
});

test('linia po prawej → pościg: skręt w prawo (DNa02 prawy)', () => {
  const { rates, motor } = settle({ tgtR: 90 });
  assert.ok(rates.DNa02_right > 20, 'DNa02_right ' + rates.DNa02_right);
  assert.ok(motor.steer > 0.5, 'steer ' + motor.steer);
});

test('mur nadlatuje z lewej → ucieczka w prawo + giant fiber', () => {
  const { rates, motor } = settle({ loomL: 140 });
  assert.ok(motor.steer > 0.3, 'steer ' + motor.steer);
  assert.ok(rates.DNp01_left + rates.DNp01_right > 200, 'GF ' + (rates.DNp01_left + rates.DNp01_right));
  assert.strictEqual(motor.handbrake, 1);
});

test('mur nadlatuje z prawej → ucieczka w lewo', () => {
  const { motor } = settle({ loomR: 140 });
  assert.ok(motor.steer < -0.3, 'steer ' + motor.steer);
});

test('percepcja: cel po lewej maski pobudza lewe LC10a, mur blisko daje looming', () => {
  const car = { x: 400, y: 300, angle: 0, speed: 100 };
  const left = FlyBrain.perceive(car, { x: 480, y: 240 }, 800, 600, 26);
  assert.ok(left.tgtL > 0 && left.tgtR === 0);
  const right = FlyBrain.perceive(car, { x: 480, y: 360 }, 800, 600, 26);
  assert.ok(right.tgtR > 0 && right.tgtL === 0);
  const nearWall = FlyBrain.perceive({ x: 740, y: 300, angle: 0, speed: 100 }, { x: 760, y: 300 }, 800, 600, 26);
  assert.ok(nearWall.loomL > 30 && nearWall.loomR > 30);
});
