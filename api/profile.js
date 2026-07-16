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
p.mods = p.mods or {}
local fields = {'engine','turbo','supercharger','injectors','fuelpump','clutch','gearbox','tires'}
for _, field in ipairs(fields) do p.mods[field] = tonumber(p.mods[field]) or 0 end
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
  p.car = ARGV[2]
end
local encoded = cjson.encode(p)
redis.call('SET', KEYS[1], encoded)
return encoded`;

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'database_not_configured' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (_) { return {}; } })() : (req.body || {});
  const rawName = req.method === 'GET' ? req.query && req.query.name : body.name;
  const name = sanitizeName(rawName);
  const key = 'tkd:profile:' + name;
  try {
    if (req.method === 'GET') {
      const result = await redis(['EVAL', MUTATE_SCRIPT, '1', key, 'load', '']);
      return res.status(200).json(JSON.parse(result.result));
    }
    if (req.method === 'POST') {
      const action = body.action;
      let value = '';
      if (action === 'buy') {
        if (!CATEGORIES.includes(body.category)) return res.status(400).json({ error: 'invalid_category' });
        value = body.category;
      } else if (action === 'select_car') {
        if (!CARS.includes(body.car)) return res.status(400).json({ error: 'invalid_car' });
        value = body.car;
      } else if (action !== 'earn' && action !== 'share_reward') return res.status(400).json({ error: 'invalid_action' });
      const result = await redis(['EVAL', MUTATE_SCRIPT, '1', key, action, value]);
      const profile = JSON.parse(result.result);
      if (profile.error) return res.status(400).json(profile);
      return res.status(200).json(profile);
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (_) {
    return res.status(500).json({ error: 'server_error' });
  }
};
