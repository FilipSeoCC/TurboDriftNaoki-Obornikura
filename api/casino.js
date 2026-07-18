'use strict';

const { createSpin, validateStake, validateSpinId, MAX_HISTORY, MIN_STAKE, MAX_STAKE } = require('./_lib/casino');
const { redis, databaseConfigured, profileKey, readProfile } = require('./_lib/store');

const IDEMPOTENCY_TTL_SECONDS = 86400;

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch (_) { return {}; }
}

const SETTLE_SPIN_SCRIPT = [
  "local previous = redis.call('GET', KEYS[2])",
  "if previous then return 'D:' .. previous end",
  "local raw = redis.call('GET', KEYS[1])",
  "local profile = raw and cjson.decode(raw) or {currency=0, car='e36_touring', carMods={}}",
  "local balance = tonumber(profile.currency) or 0",
  "local stake = tonumber(ARGV[1])",
  "if balance < stake then return 'E:not_enough_currency' end",
  "local spin = cjson.decode(ARGV[2])",
  "profile.currency = balance + tonumber(spin.net)",
  "profile.casinoHistory = profile.casinoHistory or {}",
  "table.insert(profile.casinoHistory, spin)",
  "while #profile.casinoHistory > tonumber(ARGV[3]) do table.remove(profile.casinoHistory, 1) end",
  "local response = cjson.encode({spin=spin, currency=profile.currency})",
  "redis.call('SET', KEYS[1], cjson.encode(profile))",
  "redis.call('SETEX', KEYS[2], tonumber(ARGV[4]), response)",
  "return 'N:' .. response",
].join('\n');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!databaseConfigured()) return res.status(500).json({ error: 'database_not_configured' });
  const body = parseBody(req);
  const source = req.method === 'GET' ? (req.query || {}) : body;
  const key = profileKey(source.name);

  try {
    const profile = await readProfile(key);
    if (req.method === 'GET') {
      return res.status(200).json({
        currency: profile.currency,
        history: profile.casinoHistory,
        rules: { game: 'slots', minStake: MIN_STAKE, maxStake: MAX_STAKE, payouts: { seven: 10, bell: 5, cherry: 3, lemon: 2, twoCherries: 1 } },
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (body.action !== 'spin') return res.status(400).json({ error: 'invalid_action' });
    if (!validateSpinId(body.spinId)) return res.status(400).json({ error: 'invalid_spin_id' });
    // Balance is checked inside the atomic Redis script. Keeping that check after
    // the idempotency lookup means a retried spin still returns its first result.
    const stakeCheck = validateStake(body.stake);
    if (!stakeCheck.ok) return res.status(400).json({ error: stakeCheck.error });

    const outcome = createSpin(stakeCheck.stake);
    const spin = Object.assign({ spinId: body.spinId, stake: stakeCheck.stake, createdAt: new Date().toISOString() }, outcome);
    const spinKey = key.replace('tkd:profile:', 'tkd:casino:spin:') + ':' + body.spinId;
    const settled = await redis(['EVAL', SETTLE_SPIN_SCRIPT, '2', key, spinKey, String(stakeCheck.stake), JSON.stringify(spin), String(MAX_HISTORY), String(IDEMPOTENCY_TTL_SECONDS)]);
    if (typeof settled.result !== 'string') throw new Error('invalid_settlement_result');
    if (settled.result.startsWith('E:')) return res.status(400).json({ error: settled.result.slice(2) });
    const duplicate = settled.result.startsWith('D:');
    const payload = JSON.parse(settled.result.slice(2));
    return res.status(200).json(Object.assign({}, payload, { duplicate }));
  } catch (error) {
    console.error('casino api failed', error);
    return res.status(500).json({ error: 'server_error' });
  }
};

module.exports._test = { SETTLE_SPIN_SCRIPT };
