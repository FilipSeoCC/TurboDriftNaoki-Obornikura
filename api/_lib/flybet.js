'use strict';
// Zakłady na wyścig dwóch much w kasynie. Stawka jest pobierana od razu (bilet w profilu),
// a po wyścigu klient zgłasza zwycięzcę. Zwycięzcę liczy przeglądarka (mózgi much działają
// u gracza), więc serwer pilnuje tylko: stawki, jednego otwartego biletu, minimalnego czasu
// wyścigu i wypłaty. To gra na wirtualne śrubki, a nie weryfikowany wynik.
const STAKE_MIN = 10;
const STAKE_MAX = 5000;
const PAYOUT_MULTIPLIER = 1.9;
const MIN_RACE_MS = 20000;
const TICKET_TTL_MS = 15 * 60 * 1000;

function placeBet(profile, input, now) {
  const stake = Math.floor(Number(input && input.stake) || 0);
  if (!Number.isFinite(stake) || stake < STAKE_MIN || stake > STAKE_MAX) return { error: 'invalid_stake' };
  const pick = input && input.pick;
  if (pick !== 0 && pick !== 1) return { error: 'invalid_pick' };
  if (profile.currency < stake) return { error: 'not_enough_currency' };
  // Nowy zakład przy niezamkniętym bilecie przepala stary (stawka już była pobrana).
  profile.currency -= stake;
  profile.flyBet = { stake, pick, at: now };
  return { ok: true, stake, pick, potentialPayout: Math.floor(stake * PAYOUT_MULTIPLIER) };
}

function settleBet(profile, input, now) {
  const bet = profile.flyBet;
  if (!bet) return { error: 'no_bet' };
  if (now - bet.at > TICKET_TTL_MS) { profile.flyBet = null; return { error: 'ticket_expired' }; }
  if (now - bet.at < MIN_RACE_MS) return { error: 'race_too_short' };
  const winner = input && input.winner;
  if (winner !== 0 && winner !== 1 && winner !== 'draw') return { error: 'invalid_winner' };
  const outcome = winner === 'draw' ? 'draw' : winner === bet.pick ? 'win' : 'lose';
  const payout = outcome === 'draw' ? bet.stake : outcome === 'win' ? Math.floor(bet.stake * PAYOUT_MULTIPLIER) : 0;
  profile.currency += payout;
  profile.flyBet = null;
  return { ok: true, outcome, stake: bet.stake, pick: bet.pick, payout, net: payout - bet.stake };
}

module.exports = { STAKE_MIN, STAKE_MAX, PAYOUT_MULTIPLIER, MIN_RACE_MS, TICKET_TTL_MS, placeBet, settleBet };
