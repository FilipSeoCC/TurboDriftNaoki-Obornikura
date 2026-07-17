'use strict';

const crypto = require('crypto');
const { TRACKS, GAME_MODES, TRACK_BY_ID, listCars, listTracks, assertOwnedCar } = require('./_lib/catalog');
const { redis, databaseConfigured, profileKey, readProfile, writeProfile, emptyMods } = require('./_lib/store');

const LOBBY_TTL_SECONDS = 300;
const MAX_PLAYERS = 8;

function cleanId(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max);
}

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch (_) { return {}; }
}

function lobbyKey(code) {
  return 'tkd:lobby:v1:' + code;
}

function parseLobby(result, code) {
  const values = result && result.result;
  const fields = Array.isArray(values) ? values : [];
  let meta = null;
  const players = [];
  for (let index = 0; index < fields.length; index += 2) {
    try {
      const value = JSON.parse(fields[index + 1]);
      if (fields[index] === '_meta') meta = value;
      else if (fields[index].startsWith('p:')) players.push(value);
    } catch (_) {}
  }
  if (!meta) return null;
  return { code, track: meta.track, mode: 'multiplayer', maxPlayers: MAX_PLAYERS, players };
}

async function readLobby(code) {
  return parseLobby(await redis(['HGETALL', lobbyKey(code)]), code);
}

async function joinLobby(code, player, track) {
  const key = lobbyKey(code);
  const field = 'p:' + player.id;
  const meta = JSON.stringify({ track, createdAt: new Date().toISOString() });
  const script = [
    "local meta = redis.call('HGET', KEYS[1], '_meta')",
    "if not meta then redis.call('HSET', KEYS[1], '_meta', ARGV[1]) else local parsed=cjson.decode(meta); if parsed.track ~= ARGV[2] then return 'track_mismatch' end end",
    "if redis.call('HEXISTS', KEYS[1], ARGV[3]) == 0 and redis.call('HLEN', KEYS[1]) - 1 >= tonumber(ARGV[5]) then return 'lobby_full' end",
    "redis.call('HSET', KEYS[1], ARGV[3], ARGV[4])",
    "redis.call('EXPIRE', KEYS[1], ARGV[6])",
    "return 'ok'",
  ].join('\n');
  const result = await redis(['EVAL', script, '1', key, meta, track, field, JSON.stringify(player), String(MAX_PLAYERS), String(LOBBY_TTL_SECONDS)]);
  return result.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!databaseConfigured()) return res.status(500).json({ error: 'database_not_configured' });
  const body = parseBody(req);
  const source = req.method === 'GET' ? (req.query || {}) : body;
  const key = profileKey(source.name);

  try {
    const profile = await readProfile(key);
    if (req.method === 'GET') {
      const resource = source.resource || 'bootstrap';
      if (resource === 'cars') return res.status(200).json({ cars: listCars(profile), selectedCar: profile.car });
      if (resource === 'tracks') {
        const result = listTracks(profile, source.car || profile.car, source.mode || 'singleplayer');
        return res.status(result.ok ? 200 : 400).json(result.ok ? result : { error: result.error, required: result.required });
      }
      if (resource === 'modes') return res.status(200).json({ modes: GAME_MODES.map((id) => ({ id, available: true })) });
      if (resource === 'lobby') {
        const code = cleanId(source.code, 12).toUpperCase();
        if (!code) return res.status(400).json({ error: 'invalid_lobby_code' });
        const lobby = await readLobby(code);
        return lobby ? res.status(200).json({ lobby }) : res.status(404).json({ error: 'lobby_not_found' });
      }
      if (resource !== 'bootstrap') return res.status(400).json({ error: 'invalid_resource' });
      return res.status(200).json({
        selectedCar: profile.car,
        cars: listCars(profile),
        tracks: TRACKS.map((track) => Object.assign({}, track, { unlocked: profile.unlockedTracks.includes(track.id) })),
        modes: GAME_MODES.map((id) => ({ id, available: true })),
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (body.action === 'select_car') {
      const check = assertOwnedCar(profile, body.car);
      if (!check.ok) return res.status(check.error === 'car_locked' ? 403 : 400).json({ error: check.error, required: check.required });
      profile.car = body.car;
      if (!profile.carMods[body.car]) profile.carMods[body.car] = emptyMods();
      const saved = await writeProfile(key, profile);
      return res.status(200).json({ selectedCar: saved.car, car: check.car });
    }

    if (body.action === 'validate_selection') {
      const car = body.car || profile.car;
      const mode = body.mode;
      const tracks = listTracks(profile, car, mode);
      if (!tracks.ok) return res.status(400).json({ error: tracks.error, required: tracks.required });
      const selectedTrack = tracks.tracks.find((track) => track.id === body.track);
      if (!selectedTrack) return res.status(400).json({ error: 'invalid_track' });
      if (!selectedTrack.unlocked) return res.status(403).json({ error: 'track_locked', required: selectedTrack.unlockCost });
      return res.status(200).json({ valid: true, selection: { car, track: selectedTrack.id, mode } });
    }

    if (body.action === 'create_lobby' || body.action === 'join_lobby') {
      const track = TRACK_BY_ID.has(body.track) ? body.track : '';
      const carCheck = assertOwnedCar(profile, body.car || profile.car);
      if (!carCheck.ok) return res.status(carCheck.error === 'car_locked' ? 403 : 400).json({ error: carCheck.error, required: carCheck.required });
      if (!track || !profile.unlockedTracks.includes(track)) return res.status(400).json({ error: track ? 'track_locked' : 'invalid_track' });
      const id = cleanId(body.playerId, 40);
      if (!id) return res.status(400).json({ error: 'invalid_player' });
      const code = body.action === 'create_lobby' ? crypto.randomBytes(4).toString('hex').toUpperCase() : cleanId(body.code, 12).toUpperCase();
      if (!code) return res.status(400).json({ error: 'invalid_lobby_code' });
      const player = { id, name: String(body.name || 'Anonim').slice(0, 16), car: carCheck.car.id, joinedAt: new Date().toISOString() };
      const joined = await joinLobby(code, player, track);
      if (joined === 'lobby_full') return res.status(409).json({ error: 'lobby_full' });
      if (joined === 'track_mismatch') return res.status(409).json({ error: 'track_mismatch' });
      return res.status(body.action === 'create_lobby' ? 201 : 200).json({ lobby: await readLobby(code) });
    }

    if (body.action === 'leave_lobby') {
      const code = cleanId(body.code, 12).toUpperCase();
      const id = cleanId(body.playerId, 40);
      if (!code || !id) return res.status(400).json({ error: 'invalid_lobby_request' });
      await redis(['HDEL', lobbyKey(code), 'p:' + id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'invalid_action' });
  } catch (error) {
    console.error('game api failed', error);
    return res.status(500).json({ error: 'server_error' });
  }
};

module.exports._test = { cleanId, parseLobby };
