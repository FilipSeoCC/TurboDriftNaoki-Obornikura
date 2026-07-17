// Shared garage profile backed by Upstash Redis. A nickname is only a shared
// profile key, not authentication: anyone using the same nickname shares it.
const { CAR_BY_ID, uniqueKnownCars } = require('./_lib/catalog');
const { CATEGORIES, redis, databaseConfigured, sanitizeName, emptyMods, readProfile, writeProfile } = require('./_lib/store');
const PRICE = 500;
const ROUND_REWARD = 1000;
const SHARE_REWARD = 2000;

function sanitizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

function actionError(error, required) {
  const value = { error };
  if (required) value.required = required;
  return value;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!databaseConfigured()) return res.status(500).json({ error: 'database_not_configured' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (_) { return {}; } })() : (req.body || {});
  const rawName = req.method === 'GET' ? req.query && req.query.name : body.name;
  const name = sanitizeName(rawName);
  const key = 'tkd:profile:' + name;
  const emailKey = 'tkd:email:' + name;
  try {
    const profile = await readProfile(key);
    if (req.method === 'GET') {
      const saved = await writeProfile(key, profile);
      const emailExists = await redis(['EXISTS', emailKey]);
      return res.status(200).json(Object.assign({}, saved, { emailSaved: Number(emailExists.result) === 1 }));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (body.action === 'set_email') {
      const email = sanitizeEmail(body.email);
      if (!email) return res.status(400).json(actionError('invalid_email'));
      if (body.consent !== true) return res.status(400).json(actionError('email_consent_required'));
      await redis(['SET', emailKey, JSON.stringify({ email, consentAt: new Date().toISOString() }), 'EX', 31536000]);
      return res.status(200).json(Object.assign({}, profile, { emailSaved: true }));
    }
    if (body.action === 'delete_email') {
      await redis(['DEL', emailKey]);
      return res.status(200).json(Object.assign({}, profile, { emailSaved: false }));
    }
    if (body.action === 'earn') profile.currency += ROUND_REWARD;
    else if (body.action === 'share_reward') {
      if (profile.shareRewarded) return res.status(400).json(actionError('share_reward_claimed'));
      profile.currency += SHARE_REWARD; profile.shareRewarded = true;
    } else if (body.action === 'select_car') {
      if (!CAR_BY_ID.has(body.car)) return res.status(400).json(actionError('invalid_car'));
      if (!uniqueKnownCars(profile.ownedCars, profile.car).includes(body.car)) return res.status(403).json(actionError('car_locked', CAR_BY_ID.get(body.car).unlockCost));
      profile.car = body.car;
      if (!profile.carMods[profile.car]) profile.carMods[profile.car] = emptyMods();
    } else if (body.action === 'unlock_car') {
      if (!CAR_BY_ID.has(body.car)) return res.status(400).json(actionError('invalid_car'));
      const owned = uniqueKnownCars(profile.ownedCars, profile.car);
      if (owned.includes(body.car)) return res.status(400).json(actionError('car_already_owned'));
      const cost = CAR_BY_ID.get(body.car).unlockCost;
      if (profile.currency < cost) return res.status(400).json(actionError('not_enough_currency', cost));
      profile.currency -= cost;
      profile.ownedCars = owned.concat(body.car);
      if (!profile.carMods[body.car]) profile.carMods[body.car] = emptyMods();
    } else if (body.action === 'buy') {
      const category = body.category;
      if (!CATEGORIES.includes(category)) return res.status(400).json(actionError('invalid_category'));
      if (body.car !== undefined && !CAR_BY_ID.has(body.car)) return res.status(400).json(actionError('invalid_car'));
      if (body.car !== undefined && !uniqueKnownCars(profile.ownedCars, profile.car).includes(body.car)) return res.status(403).json(actionError('car_locked', CAR_BY_ID.get(body.car).unlockCost));
      if (body.car) profile.car = body.car;
      if (!profile.carMods[profile.car]) profile.carMods[profile.car] = emptyMods();
      const mods = profile.carMods[profile.car];
      const tier = mods[category] || 0, nextTier = tier + 1;
      if (tier >= 3) return res.status(400).json(actionError('max_tier'));
      if (profile.currency < PRICE) return res.status(400).json(actionError('not_enough_currency'));
      if (category === 'turbo') {
        if (mods.supercharger > 0) return res.status(400).json(actionError('boost_conflict'));
        if (mods.clutch < nextTier) return res.status(400).json(actionError('requires_clutch', nextTier));
        if (mods.injectors < nextTier) return res.status(400).json(actionError('requires_injectors', nextTier));
        if (mods.fuelpump < nextTier) return res.status(400).json(actionError('requires_fuelpump', nextTier));
      }
      if (category === 'supercharger') {
        if (mods.turbo > 0) return res.status(400).json(actionError('boost_conflict'));
        if (mods.clutch < nextTier) return res.status(400).json(actionError('requires_clutch', nextTier));
      }
      profile.currency -= PRICE; mods[category] = nextTier;
    } else if (body.action === 'blackjack') {
      const stake = Math.floor(Number(body.stake) || 0);
      if (!Number.isFinite(stake) || stake < 10 || stake > 5000) return res.status(400).json(actionError('invalid_stake'));
      if (profile.currency < stake) return res.status(400).json(actionError('not_enough_currency'));
      const won = Math.random() < 0.25;
      profile.currency += won ? stake : -stake;
      const settled = await writeProfile(key, profile);
      return res.status(200).json(Object.assign({}, settled, { blackjack: { won, stake } }));
    } else return res.status(400).json(actionError('invalid_action'));

    return res.status(200).json(await writeProfile(key, profile));
  } catch (error) {
    console.error('profile api failed', error);
    return res.status(500).json({ error: 'server_error', detail: error && error.message ? error.message : 'unknown' });
  }
};
