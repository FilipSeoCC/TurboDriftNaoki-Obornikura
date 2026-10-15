// Lightweight same-track multiplayer presence using the existing Upstash Redis.
// Cars are client-authoritative and have no collisions; stale players expire quickly.
// Single Redis Hash per room+track. Pole `<id>` = JSON gracza, pole `r:<id>` = '1' gdy gracz jest gotowy
// (osobne pole, dzięki temu zwykły update pozycji nie musi czytać poprzedniego stanu).
// Update pozycji = 1 pipeline (HSET + HGETALL + GET) = 1 zapytanie HTTP i 3 komendy Redis.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CARS = ['e36_touring', 'e36_bodykit', 'e36_m3', 'mazda_mx5', 'bmw_e46_checker'];
const TRACK_MODES = ['rondo', 'osemka', 'ulica'];
const ACTIVE_WINDOW_MS = 12000;
const HASH_TTL_SECONDS = 300;
const MAX_PLAYERS = 16;
const EXPIRE_REFRESH_CHANCE = 0.15;
const COUNTDOWN_MS = 5000;
const ROUND_DURATION_MS = 40000;
const ROUND_RESET_BUFFER_MS = 10000;
const RACE_TTL_SECONDS = 120;

async function redis(command) {
  const pipeline = Array.isArray(command[0]);
  const response = await fetch(REDIS_URL + (pipeline ? '/pipeline' : ''), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('redis error ' + response.status);
  const data = await response.json();
  // Pipeline zwraca HTTP 200 nawet gdy pojedyncza komenda się nie udała: traktuj to jak błąd, nie jak pusty pokój.
  if (Array.isArray(data) ? data.some((item) => item && item.error) : (data && data.error)) throw new Error('redis command error');
  return data;
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
  return 'tkd:room:v3:' + track + ':' + room;
}

function raceKey(room, track) {
  return 'tkd:room:race:v1:' + track + ':' + room;
}

function readyField(id) { return 'r:' + id; }

// HGETALL przez REST zwraca płaską tablicę [pole, wartość, ...] (albo obiekt przy RESP3).
function hashEntries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const entries = [];
    for (let i = 0; i + 1 < raw.length; i += 2) entries.push([raw[i], raw[i + 1]]);
    return entries;
  }
  return Object.keys(raw).map((field) => [field, raw[field]]);
}

function parseAndFilter(rawHash, now) {
  const stale = [];
  const active = [];
  const ready = new Set();
  const entries = hashEntries(rawHash);
  for (let i = 0; i < entries.length; i++) {
    const field = entries[i][0];
    if (typeof field === 'string' && field.indexOf('r:') === 0) { if (entries[i][1] === '1') ready.add(field.slice(2)); continue; }
    const raw = entries[i][1];
    if (!raw) continue;
    let player;
    try { player = JSON.parse(raw); } catch (_) { continue; }
    if (!player || typeof player.id !== 'string') continue;
    if (now - (player.t || 0) > ACTIVE_WINDOW_MS) { stale.push(player.id); continue; }
    active.push(player);
  }
  active.sort((a, b) => (b.t || 0) - (a.t || 0));
  const players = active.slice(0, MAX_PLAYERS).map((player) => Object.assign({}, player, { ready: ready.has(player.id) }));
  // gotowość graczy, którzy wygasli lub zniknęli, też sprzątamy
  ready.forEach((id) => { if (!active.some((player) => player.id === id) && stale.indexOf(id) === -1) stale.push(id); });
  return { active: players, stale };
}

async function cleanup(key, staleIds) {
  if (!staleIds.length) return;
  const fields = [];
  staleIds.forEach((id) => { fields.push(id, readyField(id)); });
  try { await redis([['HDEL', key].concat(fields)]); } catch (_) {}
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
    await redis([
      ['HDEL', key].concat(resetPlayers.map((player) => readyField(player.id))),
      ['DEL', stateKey],
      ['EXPIRE', key, String(HASH_TTL_SECONDS)],
    ]);
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
      const result = await redis([['HGETALL', key], ['GET', stateKey]]);
      const parsed = parseAndFilter(result[0] && result[0].result, now);
      await cleanup(key, parsed.stale);
      const resolved = await resolveRaceState(key, stateKey, parsed.active, now, result[1] && result[1].result);
      return res.status(200).json({ room, track, players: resolved.players, race: resolved.race });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const id = clean(body.id, '', 40);
    if (!id) return res.status(400).json({ error: 'invalid_player' });

    if (body.action === 'leave') {
      const result = await redis([['HDEL', key, id, readyField(id)], ['HGETALL', key]]);
      const parsed = parseAndFilter(result[1] && result[1].result, now);
      if (!parsed.active.length) await redis(['DEL', stateKey]);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'ready') {
      const lookup = await redis([['HGET', key, id], ['HGET', key, readyField(id)]]);
      const existingRaw = lookup[0] && lookup[0].result;
      const wasReady = !!(lookup[1] && lookup[1].result === '1');
      let player;
      try { player = existingRaw ? JSON.parse(existingRaw) : null; } catch (_) { player = null; }
      if (!player || now - (player.t || 0) > ACTIVE_WINDOW_MS) {
        if (player) {
          const result = await redis([['HDEL', key, id, readyField(id)], ['HGETALL', key]]);
          const remaining = parseAndFilter(result[1] && result[1].result, now);
          if (!remaining.active.length) await redis(['DEL', stateKey]);
        }
        return res.status(404).json({ error: 'player_not_found' });
      }
      player.t = now;
      const result = await redis([
        ['HSET', key, id, JSON.stringify(player)],
        wasReady ? ['HDEL', key, readyField(id)] : ['HSET', key, readyField(id), '1'],
        ['EXPIRE', key, String(HASH_TTL_SECONDS)],
        ['HGETALL', key],
        ['GET', stateKey],
      ]);
      const parsed = parseAndFilter(result[3] && result[3].result, now);
      await cleanup(key, parsed.stale);
      const resolved = await resolveRaceState(key, stateKey, parsed.active, now, result[4] && result[4].result);
      return res.status(200).json({ room, track, players: resolved.players, race: resolved.race });
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
    // Jedno zapytanie HTTP: zapis pozycji + odczyt pokoju + stan wyścigu. TTL odświeżamy tylko czasem
    // (i od razu, gdy to nowy gracz), żeby nie płacić za EXPIRE przy każdej aktualizacji.
    const commands = [['HSET', key, id, JSON.stringify(player)], ['HGETALL', key], ['GET', stateKey]];
    if (Math.random() < EXPIRE_REFRESH_CHANCE) commands.push(['EXPIRE', key, String(HASH_TTL_SECONDS)]);
    const result = await redis(commands);
    if (result[0] && result[0].result === 1 && commands.length === 3) {
      try { await redis(['EXPIRE', key, String(HASH_TTL_SECONDS)]); } catch (_) {}
    }
    const parsed = parseAndFilter(result[1] && result[1].result, now);
    await cleanup(key, parsed.stale);
    const resolved = await resolveRaceState(key, stateKey, parsed.active, now, result[2] && result[2].result);
    return res.status(200).json({ room, track, players: resolved.players, race: resolved.race });
  } catch (_) {
    return res.status(500).json({ error: 'server_error' });
  }
};
