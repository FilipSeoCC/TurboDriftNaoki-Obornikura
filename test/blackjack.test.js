const test = require('node:test');
const assert = require('node:assert/strict');
const { drawOutcome, settleBlackjack } = require('../api/blackjack');

test('draws win in the first 40 percent of the range', () => {
  assert.equal(drawOutcome(0, 18), 'win');
  assert.equal(drawOutcome(0.399999, 18), 'win');
});

test('draws push from 40 through 50 percent', () => {
  assert.equal(drawOutcome(0.4, 18), 'push');
  assert.equal(drawOutcome(0.499999, 18), 'push');
});

test('draws loss above the push range', () => {
  assert.equal(drawOutcome(0.5, 18), 'lose');
  assert.equal(drawOutcome(0.999999, 18), 'lose');
});

test('a busted player always loses', () => {
  assert.equal(drawOutcome(0, 22), 'lose');
});

test('natural 21 can never become an impossible loss', () => {
  assert.equal(drawOutcome(0.9, 21), 'push');
});

test('win pays ten times the stake after collecting the stake', () => {
  assert.deepEqual(settleBlackjack(100, 'win'), { payout: 1000, net: 900 });
});

test('push refunds the exact stake with no profit or loss', () => {
  assert.deepEqual(settleBlackjack(100, 'push'), { payout: 100, net: 0 });
});

test('loss keeps the stake', () => {
  assert.deepEqual(settleBlackjack(100, 'lose'), { payout: 0, net: -100 });
});
