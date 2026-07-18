const WIN_CHANCE = 0.40;
const PUSH_CHANCE = 0.10;
const WIN_MULTIPLIER = 10;

function drawOutcome(randomValue, playerTotal) {
  if (Number.isFinite(playerTotal) && playerTotal > 21) return 'lose';

  const roll = Number(randomValue);
  let outcome = roll < WIN_CHANCE
    ? 'win'
    : roll < WIN_CHANCE + PUSH_CHANCE ? 'push' : 'lose';

  // A dealer cannot beat a non-busted 21. Convert that impossible result to
  // a push so the settlement and cards shown by the client stay coherent.
  if (playerTotal === 21 && outcome === 'lose') outcome = 'push';
  return outcome;
}

function settleBlackjack(stake, outcome) {
  const payout = outcome === 'win' ? stake * WIN_MULTIPLIER : outcome === 'push' ? stake : 0;
  return { payout, net: payout - stake };
}

module.exports = {
  WIN_CHANCE,
  PUSH_CHANCE,
  WIN_MULTIPLIER,
  drawOutcome,
  settleBlackjack,
};
