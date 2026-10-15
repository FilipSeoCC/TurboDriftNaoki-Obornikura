'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { placeBet, settleBet, MIN_RACE_MS, TICKET_TTL_MS } = require('../api/_lib/flybet');

const t0 = 1_000_000;
const fresh = (currency = 1000) => ({ currency, flyBet: null });

test('stawka musi być całkowita, w limitach i w ramach salda', () => {
  assert.equal(placeBet(fresh(), { stake: 5, pick: 0 }, t0).error, 'invalid_stake');
  assert.equal(placeBet(fresh(10000), { stake: 5001, pick: 0 }, t0).error, 'invalid_stake');
  assert.equal(placeBet(fresh(50), { stake: 100, pick: 0 }, t0).error, 'not_enough_currency');
  assert.equal(placeBet(fresh(), { stake: 100, pick: 2 }, t0).error, 'invalid_pick');
});

test('postawienie zakładu pobiera stawkę od razu i zapisuje bilet', () => {
  const p = fresh();
  const r = placeBet(p, { stake: 100, pick: 1 }, t0);
  assert.equal(r.ok, true); assert.equal(r.potentialPayout, 190);
  assert.equal(p.currency, 900);
  assert.deepEqual(p.flyBet, { stake: 100, pick: 1, at: t0 });
});

test('wygrana wypłaca 1,9x stawki, przegrana nic, remis zwraca stawkę', () => {
  for (const [winner, outcome, payout] of [[1, 'win', 190], [0, 'lose', 0], ['draw', 'draw', 100]]) {
    const p = fresh(); placeBet(p, { stake: 100, pick: 1 }, t0);
    const s = settleBet(p, { winner }, t0 + MIN_RACE_MS);
    assert.equal(s.outcome, outcome); assert.equal(s.payout, payout); assert.equal(s.net, payout - 100);
    assert.equal(p.currency, 900 + payout); assert.equal(p.flyBet, null);
  }
});

test('nie da się rozliczyć dwa razy ani bez biletu', () => {
  const p = fresh(); placeBet(p, { stake: 100, pick: 0 }, t0);
  assert.equal(settleBet(p, { winner: 0 }, t0 + MIN_RACE_MS).ok, true);
  assert.equal(settleBet(p, { winner: 0 }, t0 + MIN_RACE_MS).error, 'no_bet');
});

test('rozliczenie przed końcem wyścigu i po wygaśnięciu biletu jest odrzucone', () => {
  const p = fresh(); placeBet(p, { stake: 100, pick: 0 }, t0);
  assert.equal(settleBet(p, { winner: 0 }, t0 + 1000).error, 'race_too_short');
  assert.ok(p.flyBet, 'bilet zostaje');
  assert.equal(settleBet(p, { winner: 0 }, t0 + TICKET_TTL_MS + 1).error, 'ticket_expired');
  assert.equal(p.flyBet, null); assert.equal(p.currency, 900);
});

test('niepoprawny zwycięzca jest odrzucony', () => {
  const p = fresh(); placeBet(p, { stake: 100, pick: 0 }, t0);
  assert.equal(settleBet(p, { winner: 'x' }, t0 + MIN_RACE_MS).error, 'invalid_winner');
});
