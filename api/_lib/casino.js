'use strict';

const SYMBOLS = Object.freeze(['cherry', 'lemon', 'bell', 'seven']);
const MIN_STAKE = 10;
const MAX_STAKE = 5000;
const MAX_HISTORY = 20;

function validateStake(value, balance) {
  const stake = Number(value);
  if (!Number.isSafeInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) return { ok: false, error: 'invalid_stake' };
  if (balance !== undefined && (!Number.isFinite(balance) || stake > balance)) return { ok: false, error: 'not_enough_currency' };
  return { ok: true, stake };
}

function validateSpinId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

function payoutMultiplier(symbols) {
  if (!Array.isArray(symbols) || symbols.length !== 3) return 0;
  if (symbols.every((symbol) => symbol === 'seven')) return 10;
  if (symbols.every((symbol) => symbol === 'bell')) return 5;
  if (symbols.every((symbol) => symbol === 'cherry')) return 3;
  if (symbols.every((symbol) => symbol === 'lemon')) return 2;
  if (symbols.filter((symbol) => symbol === 'cherry').length === 2) return 1;
  return 0;
}

function drawSymbols(random) {
  const rng = typeof random === 'function' ? random : Math.random;
  return [0, 1, 2].map(() => {
    const value = rng();
    const index = Number.isFinite(value) ? Math.max(0, Math.min(SYMBOLS.length - 1, Math.floor(value * SYMBOLS.length))) : 0;
    return SYMBOLS[index];
  });
}

function createSpin(stake, random) {
  const symbols = drawSymbols(random);
  const multiplier = payoutMultiplier(symbols);
  const payout = stake * multiplier;
  return { symbols, multiplier, payout, net: payout - stake };
}

function settleSpinState(state, spin) {
  const source = state && typeof state === 'object' ? state : {};
  const processed = Object.assign({}, source.processed);
  if (processed[spin.spinId]) return { duplicate: true, currency: source.currency, spin: processed[spin.spinId], processed };
  if (spin.stake > source.currency) return { error: 'not_enough_currency', currency: source.currency, processed };
  processed[spin.spinId] = spin;
  return { duplicate: false, currency: source.currency + spin.net, spin, processed };
}

module.exports = { SYMBOLS, MIN_STAKE, MAX_STAKE, MAX_HISTORY, validateStake, validateSpinId, payoutMultiplier, drawSymbols, createSpin, settleSpinState };
