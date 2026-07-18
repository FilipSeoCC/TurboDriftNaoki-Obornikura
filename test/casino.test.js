'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStake, validateSpinId, payoutMultiplier, drawSymbols, createSpin, settleSpinState } = require('../api/_lib/casino');

test('stake must be a positive integer within limits and balance', () => {
  assert.deepEqual(validateStake(-10, 1000), { ok: false, error: 'invalid_stake' });
  assert.deepEqual(validateStake(0, 1000), { ok: false, error: 'invalid_stake' });
  assert.deepEqual(validateStake(10.5, 1000), { ok: false, error: 'invalid_stake' });
  assert.deepEqual(validateStake(5001, 10000), { ok: false, error: 'invalid_stake' });
  assert.deepEqual(validateStake(1001, 1000), { ok: false, error: 'not_enough_currency' });
  assert.deepEqual(validateStake(100, 1000), { ok: true, stake: 100 });
});

test('spin id is required and constrained for idempotency', () => {
  assert.equal(validateSpinId('spin_20260718_01'), true);
  assert.equal(validateSpinId('short'), false);
  assert.equal(validateSpinId('spin with spaces'), false);
  assert.equal(validateSpinId('x'.repeat(65)), false);
});

test('payout table returns expected multipliers', () => {
  assert.equal(payoutMultiplier(['seven', 'seven', 'seven']), 10);
  assert.equal(payoutMultiplier(['bell', 'bell', 'bell']), 5);
  assert.equal(payoutMultiplier(['cherry', 'cherry', 'cherry']), 3);
  assert.equal(payoutMultiplier(['lemon', 'lemon', 'lemon']), 2);
  assert.equal(payoutMultiplier(['cherry', 'lemon', 'cherry']), 1);
  assert.equal(payoutMultiplier(['cherry', 'bell', 'seven']), 0);
});

test('random draws are deterministic when rng is injected', () => {
  const values = [0, 0.26, 0.99];
  assert.deepEqual(drawSymbols(() => values.shift()), ['cherry', 'lemon', 'seven']);
});

test('spin payout and net are calculated from stake', () => {
  const spin = createSpin(100, () => 0.99);
  assert.deepEqual(spin, { symbols: ['seven', 'seven', 'seven'], multiplier: 10, payout: 1000, net: 900 });
});

test('same spin id is settled only once', () => {
  const spin = { spinId: 'spin_duplicate_01', stake: 100, payout: 300, net: 200 };
  const first = settleSpinState({ currency: 1000, processed: {} }, spin);
  assert.equal(first.currency, 1200);
  assert.equal(first.duplicate, false);
  const retried = settleSpinState({ currency: first.currency, processed: first.processed }, spin);
  assert.equal(retried.currency, 1200);
  assert.equal(retried.duplicate, true);
});

test('settlement rejects a stake larger than current balance', () => {
  const spin = { spinId: 'spin_too_large_01', stake: 1001, payout: 0, net: -1001 };
  assert.equal(settleSpinState({ currency: 1000, processed: {} }, spin).error, 'not_enough_currency');
});
