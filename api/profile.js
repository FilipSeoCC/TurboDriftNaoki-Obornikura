// Shared garage profile backed by Upstash Redis. A nickname is only a shared
// profile key, not authentication: anyone using the same nickname shares it.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PRICE = 500;
const ROUND_REWARD = 1000;
const SHARE_REWARD = 100000;
const CATEGORIES = ['engine', 'turbo', 'supercharger', 'injectors', 'fuelpump', 'clutch', 'gearbox', 'tires'];
const CARS = ['e36_touring', 'e36_bodykit', 'e36_m3', 'mazda_mx5', 'bmw_e46_checker'];

async function redis(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('redis error ' + response.status);
  return response.json();
}

function sanitizeName(value) {
  if (typeof value !== 'string') return 'anonim';
  return (value.replace(/[<>&"'`]/g, '').trim().slice(0, 16) || 'Anonim').toLowerCase();
}

const MUTATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local p
if raw then p = cjson.decode(raw) else p = {currency=0,mods={engine=0,turbo=0,supercharger=0,injectors=0,fuelpump=0,clutch=0,gearbox=0,tires=0},car='e36_touring'} end
local fields = {'engine','turbo','supercharger','injectors','fuelpump','clutch','gearbox','tires'}
local function normalizeMods(mods)
  mods = mods or {}
  for _, field in ipairs(fields) do mods[field] = tonumber(mods[field]) or 0 end
  return mods
end
p.car = p.car or 'e36_touring'
p.carMods = p.carMods or {}
-- Migrate the old global tuning once, assigning it to the currently selected car.
if next(p.carMods) == nil then p.carMods[p.car] = normalizeMods(p.mods) end
for carId, mods in pairs(p.carMods) do p.carMods[carId] = normalizeMods(mods) end
if not p.carMods[p.car] then p.carMods[p.car] = normalizeMods({}) end
p.mods = p.carMods[p.car]
p.shareRewarded = p.shareRewarded == true
local action = ARGV[1]
if action == 'earn' then
  p.currency = (tonumber(p.currency) or 0) + ${ROUND_REWARD}
elseif action == 'share_reward' then
  if p.shareRewarded then return cjson.encode({error='share_reward_claimed'}) end
  p.currency = (tonumber(p.currency) or 0) + ${SHARE_REWARD}
  p.shareRewarded = true
elseif action == 'buy' then
  local category = ARGV[2]
  local tier = tonumber(p.mods[category]) or 0
  local nextTier = tier + 1
  if tier >= 3 then return cjson.encode({error='max_tier'}) end
  if (tonumber(p.currency) or 0) < ${PRICE} then return cjson.encode({error='not_enough_currency'}) end
  if category == 'turbo' then
    if p.mods.supercharger > 0 then return cjson.encode({error='boost_conflict'}) end
    if p.mods.clutch < nextTier then return cjson.encode({error='requires_clutch',required=nextTier}) end
    if p.mods.injectors < nextTier then return cjson.encode({error='requires_injectors',required=nextTier}) end
    if p.mods.fuelpump < nextTier then return cjson.encode({error='requires_fuelpump',required=nextTier}) end
  elseif category == 'supercharger' then
    if p.mods.turbo > 0 then return cjson.encode({error='boost_conflict'}) end
    if p.mods.clutch < nextTier then return cjson.encode({error='requires_clutch',required=nextTier}) end
  end
  p.currency = tonumber(p.currency) - ${PRICE}
  p.mods[category] = tier + 1
elseif action == 'select_car' then
  p.carMods[p.car] = p.mods
  p.car = ARGV[2]
  if not p.carMods[p.car] then p.carMods[p.car] = normalizeMods({}) end
  p.mods = p.carMods[p.car]
end
p.carMods[p.car] = p.mods
local encoded = cjson.encode(p)
redis.call('SET', KEYS[1], encoded)
return encoded`;

function emptyMods() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
}

function normalizeMods(value) {
  const source = value && typeof value === 'object' ? value : {};
  const mods = emptyMods();
  for (const category of CATEGORIES) {
    const tier = Number(source[category]);
    mods[category] = Number.isFinite(tier) ? Math.max(0, Math.min(3, Math.floor(tier))) : 0;
  }
  return mods;
}

function normalizeProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const car = CARS.includes(source.car) ? source.car : 'e36_touring';
  const carMods = {};
  if (source.carMods && typeof source.carMods === 'object') {
    for (const id of CARS) if (source.carMods[id]) carMods[id] = normalizeMods(source.carMods[id]);
  }
  if (!Object.keys(carMods).length) carMods[car] = normalizeMods(source.mods);
  if (!carMods[car]) carMods[car] = emptyMods();
  return { currency: Math.max(0, Number(source.currency) || 0), shareRewarded: source.shareRewarded === true, car, carMods, mods: carMods[car] };
}

async function readProfile(key) {
  const result = await redis(['GET', key]);
  if (!result.result) return normalizeProfile({});
  try { return normalizeProfile(JSON.parse(result.result)); } catch (_) { return normalizeProfile({}); }
}

async function writeProfile(key, profile) {
  profile.carMods[profile.car] = normalizeMods(profile.mods);
  profile.mods = profile.carMods[profile.car];
  await redis(['SET', key, JSON.stringify(profile)]);
  return profile;
}

function actionError(error, required) {
  const value = { error };
  if (required) value.required = required;
  return value;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'database_not_configured' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (_) { return {}; } })() : (req.body || {});
  const rawName = req.method === 'GET' ? req.query && req.query.name : body.name;
  const name = sanitizeName(rawName);
  const key = 'tkd:profile:' + name;
  try {
    const profile = await readProfile(key);
    if (req.method === 'GET') return res.status(200).json(await writeProfile(key, profile));
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (body.action === 'earn') profile.currency += ROUND_REWARD;
    else if (body.action === 'share_reward') {
      if (profile.shareRewarded) return res.status(400).json(actionError('share_reward_claimed'));
      profile.currency += SHARE_REWARD; profile.shareRewarded = true;
    } else if (body.action === 'select_car') {
      if (!CARS.includes(body.car)) return res.status(400).json(actionError('invalid_car'));
      profile.carMods[profile.car] = normalizeMods(profile.mods);
      profile.car = body.car;
      if (!profile.carMods[profile.car]) profile.carMods[profile.car] = emptyMods();
      profile.mods = profile.carMods[profile.car];
    } else if (body.action === 'buy') {
      const category = body.category;
      if (!CATEGORIES.includes(category)) return res.status(400).json(actionError('invalid_category'));
      const tier = profile.mods[category] || 0, nextTier = tier + 1;
      if (tier >= 3) return res.status(400).json(actionError('max_tier'));
      if (profile.currency < PRICE) return res.status(400).json(actionError('not_enough_currency'));
      if (category === 'turbo') {
        if (profile.mods.supercharger > 0) return res.status(400).json(actionError('boost_conflict'));
        if (profile.mods.clutch < nextTier) return res.status(400).json(actionError('requires_clutch', nextTier));
        if (profile.mods.injectors < nextTier) return res.status(400).json(actionError('requires_injectors', nextTier));
        if (profile.mods.fuelpump < nextTier) return res.status(400).json(actionError('requires_fuelpump', nextTier));
      }
      if (category === 'supercharger') {
        if (profile.mods.turbo > 0) return res.status(400).json(actionError('boost_conflict'));
        if (profile.mods.clutch < nextTier) return res.status(400).json(actionError('requires_clutch', nextTier));
      }
      profile.currency -= PRICE; profile.mods[category] = nextTier;
    } else return res.status(400).json(actionError('invalid_action'));

    return res.status(200).json(await writeProfile(key, profile));
  } catch (_) {
    return res.status(500).json({ error: 'server_error' });
  }
};
