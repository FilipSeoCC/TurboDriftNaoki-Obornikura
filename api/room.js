// Lightweight same-track multiplayer presence using the existing Upstash Redis.
// Cars are client-authoritative and have no collisions; stale players expire quickly.
// Single Redis Hash per room+track; each request = 1 pipeline (HSET/HDEL + EXPIRE + HVALS).
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CARS = ['e36_touring', 'e36_bodykit', 'e36_m3', 'mazda_mx5', 'bmw_e46_checker'];
const TRACK_MODES = ['rondo', 'osemka', 'ulica'];
const ACTIVE_WINDOW_MS = 12000;
const HASH_TTL_SECONDS = 300;
const MAX_PLAYERS = 8;
const COUNTDOWN_MS = 5000;
const ROUND_DURATION_MS = 40000;
const ROUND_RESET_BUFFER_MS = 10000;
const RACE_TTL_SECONDS = 60;

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

function roomKey(room, track) {
  return 'tkd:room:v2:' + track + ':' + room;
}

function raceKey(room, track) {
  return 'tkd:room:race:v1:' + track + ':' + room;
}

function parseAndFilter(rawValues, now) {
  const stale = [];
  const active = [];
  for (let i = 0; i < rawValues.length; i++) {
    const raw = rawValues[i];
    if (!raw) continue;
    let player;
    try { player = JSON.parse(raw); } catch (_) { continue; }
    if (!player || typeof player.id !== 'string') continue;
    if (now - (player.t || 0) > ACTIVE_WINDOW_MS) { stale.push(player.id); continue; }
    active.push(player);
  }
  active.sort((a, b) => (b.t || 0) - (a.t || 0));
  return { active: active.slice(0, MAX_PLAYERS), stale };
}

async function fireAndForgetCleanup(key, staleIds) {
  if (!staleIds.length) return;
  try { await redis([['HDEL', key].concat(staleIds)]); } catch (_) {}
}

function parseStartAt(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function publicRace(startAt, now) {
  if (!startAt) return { status: 'waiting', startAt: null };
  return { status: now < startAt ? 'countdown' : 'racing', startAt };
}

async function resolveRaceState(key, stateKey, players, now, rawStartAt) {
  let startAt = parseStartAt(rawStartAt);

  if (!players.length) {
    if (startAt) await redis(['DEL', stateKey]);
    return { players, race: publicRace(null, now) };
  }

  if (startAt && now >= startAt + ROUND_DURATION_MS + ROUND_RESET_BUFFER_MS) {
    const resetPlayers = players.map((player) => Object.assign({}, player, { ready: false }));
    const commands = resetPlayers.map((player) => ['HSET', key, player.id, JSON.stringify(player)]);
    commands.push(['DEL', stateKey]);
    commands.push(['EXPIRE', key, String(HASH_TTL_SECONDS)]);
    await redis(commands);
    return { players: resetPlayers, race: publicRace(null, now) };
  }

  const allReady = players.length >= 2 && players.every((player) => player.ready === true);
  if (!startAt && allReady) {
    const proposedStartAt = now + COUNTDOWN_MS;
    const result = await redis([
      ['SET', stateKey, String(proposedStartAt), 'NX', 'EX', String(RACE_TTL_SECONDS)],
      ['GET', stateKey],
    ]);
    startAt = parseStartAt(result[1] && result[1].result);
  }

  return { players, race: publicRace(startAt, now) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'database_not_configured' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};
  const source = req.method === 'GET' ? (req.query || {}) : body;
  const room = clean(source.room, 'PUBLIC', 12).toUpperCase();
  const track = TRACK_MODES.includes(source.track) ? source.track : 'osemka';
  const key = roomKey(room, track);
  const stateKey = raceKey(room, track);
  const now = Date.now();

  try {
    if (req.method === 'GET') {
      const result = await redis([['HVALS', key], ['GET', stateKey]]);
      const parsed = parseAndFilter((result[0] && result[0].result) || [], now);
      if (parsed.stale.length) fireAndForgetCleanup(key, parsed.stale);
      const resolved = await resolveRaceState(key, stateKey, parsed.active, now, result[1] && result[1].result);
      return res.status(200).json({ room, track, players: resolved.players, race: resolved.race });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const id = clean(body.id, '', 40);
    if (!id) return res.status(400).json({ error: 'invalid_player' });

    if (body.action === 'leave') {
      const result = await redis([['HDEL', key, id], ['HVALS', key]]);
      const parsed = parseAndFilter((result[1] && result[1].result) || [], now);
      if (!parsed.active.length) await redis(['DEL', stateKey]);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'ready') {
      const existingResult = await redis(['HGET', key, id]);
      let player;
      try { player = existingResult.result ? JSON.parse(existingResult.result) : null; } catch (_) { player = null; }
      if (!player || now - (player.t || 0) > ACTIVE_WINDOW_MS) {
        if (player) {
          const result = await redis([['HDEL', key, id], ['HVALS', key]]);
          const remaining = parseAndFilter((result[1] && result[1].result) || [], now);
          if (!remaining.active.length) await redis(['DEL', stateKey]);
        }
        return res.status(404).json({ error: 'player_not_found' });
      }
      player.ready = player.ready !== true;
      player.t = now;
      const result = await redis([
        ['HSET', key, id, JSON.stringify(player)],
        ['EXPIRE', key, String(HASH_TTL_SECONDS)],
        ['HVALS', key],
        ['GET', stateKey],
      ]);
      const parsed = parseAndFilter((result[2] && result[2].result) || [], now);
      if (parsed.stale.length) fireAndForgetCleanup(key, parsed.stale);
      const resolved = await resolveRaceState(key, stateKey, parsed.active, now, result[3] && result[3].result);
      return res.status(200).json({ room, track, players: resolved.players, race: resolved.race });
    }

    if (body.action !== 'update') return res.status(400).json({ error: 'invalid_action' });

    const existingResult = await redis(['HGET', key, id]);
    let existingPlayer;
    try { existingPlayer = existingResult.result ? JSON.parse(existingResult.result) : null; } catch (_) { existingPlayer = null; }

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
      ready: !!(existingPlayer && now - (existingPlayer.t || 0) <= ACTIVE_WINDOW_MS && existingPlayer.ready === true),
    };
    const result = await redis([
      ['HSET', key, id, JSON.stringify(player)],
      ['EXPIRE', key, String(HASH_TTL_SECONDS)],
      ['HVALS', key],
      ['GET', stateKey],
    ]);
    const rawValues = (result[2] && result[2].result) || [];
    const parsed = parseAndFilter(rawValues, now);
    if (parsed.stale.length) fireAndForgetCleanup(key, parsed.stale);
    const resolved = await resolveRaceState(key, stateKey, parsed.active, now, result[3] && result[3].result);
    return res.status(200).json({ room, track, players: resolved.players, race: resolved.race });
  } catch (_) {
    return res.status(500).json({ error: 'server_error' });
  }
};
