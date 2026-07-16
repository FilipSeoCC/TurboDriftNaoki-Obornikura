// Lightweight same-track multiplayer presence using the existing Upstash Redis.
// Cars are client-authoritative and have no collisions; stale players expire quickly.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CARS = ['e36_touring', 'e36_bodykit', 'e36_m3', 'mazda_mx5', 'bmw_e46_checker'];
const PLAYER_TTL_SECONDS = 15;
const ACTIVE_WINDOW_MS = 12000;
const MAX_PLAYERS = 8;

async function redis(command) {
  const pipeline = Array.isArray(command[0]);
  const response = await fetch(REDIS_URL + (pipeline ? '/pipeline' : ''), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('redis error ' + response.status);
  return response.json();
}

function clean(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  const result = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max);
  return result || fallback;
}

function number(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function roomKeys(room, track) {
  const prefix = 'tkd:room:v1:' + track + ':' + room;
  return { players: prefix + ':players', player: (id) => prefix + ':player:' + id };
}

async function listPlayers(keys, now) {
  const idsResult = await redis(['ZREVRANGEBYSCORE', keys.players, '+inf', String(now - ACTIVE_WINDOW_MS), 'LIMIT', '0', String(MAX_PLAYERS)]);
  const ids = idsResult.result || [];
  if (!ids.length) return [];
  const valuesResult = await redis(['MGET'].concat(ids.map(keys.player)));
  return (valuesResult.result || []).map((raw) => {
    try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'database_not_configured' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};
  const source = req.method === 'GET' ? (req.query || {}) : body;
  const room = clean(source.room, 'PUBLIC', 12).toUpperCase();
  const track = source.track === 'rondo' ? 'rondo' : 'osemka';
  const keys = roomKeys(room, track);
  const now = Date.now();

  try {
    if (req.method === 'GET') return res.status(200).json({ room, track, players: await listPlayers(keys, now) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const id = clean(body.id, '', 40);
    if (!id) return res.status(400).json({ error: 'invalid_player' });
    if (body.action === 'leave') {
      await redis([['ZREM', keys.players, id], ['DEL', keys.player(id)]]);
      return res.status(200).json({ ok: true });
    }
    if (body.action !== 'update') return res.status(400).json({ error: 'invalid_action' });

    const player = {
      id,
      name: clean(body.name, 'Anonim', 16),
      car: CARS.includes(body.car) ? body.car : 'e36_touring',
      x: number(body.x, 0, 1, 0.5),
      y: number(body.y, 0, 1, 0.5),
      angle: number(body.angle, -100, 100, 0),
      speed: number(body.speed, 0, 1000, 0),
      score: Math.round(number(body.score, 0, 200000, 0)),
      t: now,
    };
    await redis([
      ['ZADD', keys.players, String(now), id],
      ['ZREMRANGEBYSCORE', keys.players, '-inf', String(now - ACTIVE_WINDOW_MS)],
      ['EXPIRE', keys.players, '120'],
      ['SET', keys.player(id), JSON.stringify(player), 'EX', String(PLAYER_TTL_SECONDS)],
    ]);
    return res.status(200).json({ room, track, players: await listPlayers(keys, now) });
  } catch (_) {
    return res.status(500).json({ error: 'server_error' });
  }
};
