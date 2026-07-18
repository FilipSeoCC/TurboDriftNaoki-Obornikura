'use strict';

const { CAR_BY_ID, uniqueKnownCars, uniqueKnownTracks } = require('./catalog');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CATEGORIES = Object.freeze(['engine', 'turbo', 'supercharger', 'injectors', 'fuelpump', 'clutch', 'gearbox', 'tires']);

async function redis(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('redis error ' + response.status);
  return response.json();
}

function databaseConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

function sanitizeName(value) {
  if (typeof value !== 'string') return 'anonim';
  return (value.replace(/[<>&"'`]/g, '').trim().slice(0, 16) || 'Anonim').toLowerCase();
}

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

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).filter((item) => item && typeof item === 'object').map((item) => ({
    spinId: String(item.spinId || '').slice(0, 64),
    stake: Math.max(0, Math.floor(Number(item.stake) || 0)),
    payout: Math.max(0, Math.floor(Number(item.payout) || 0)),
    net: Math.floor(Number(item.net) || 0),
    symbols: Array.isArray(item.symbols) ? item.symbols.slice(0, 3).map(String) : [],
    createdAt: String(item.createdAt || ''),
  }));
}

function normalizeProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const car = CAR_BY_ID.has(source.car) ? source.car : 'e36_touring';
  const carMods = {};
  if (source.carMods && typeof source.carMods === 'object') {
    for (const id of CAR_BY_ID.keys()) if (source.carMods[id]) carMods[id] = normalizeMods(source.carMods[id]);
  }
  if (!Object.keys(carMods).length) carMods[car] = normalizeMods(source.mods);
  if (!carMods[car]) carMods[car] = emptyMods();
  return {
    currency: Math.max(0, Math.floor(Number(source.currency) || 0)),
    shareRewarded: source.shareRewarded === true,
    car,
    carMods,
    ownedCars: uniqueKnownCars(source.ownedCars, car),
    unlockedTracks: uniqueKnownTracks(source.unlockedTracks),
    casinoHistory: normalizeHistory(source.casinoHistory),
  };
}

function profileKey(name) {
  return 'tkd:profile:' + sanitizeName(name);
}

async function readProfile(key) {
  const result = await redis(['GET', key]);
  if (!result.result) return normalizeProfile({});
  try { return normalizeProfile(JSON.parse(result.result)); } catch (_) { return normalizeProfile({}); }
}

async function writeProfile(key, profile) {
  const normalized = normalizeProfile(profile);
  await redis(['SET', key, JSON.stringify(normalized)]);
  return normalized;
}

module.exports = {
  REDIS_URL,
  REDIS_TOKEN,
  CATEGORIES,
  redis,
  databaseConfigured,
  sanitizeName,
  emptyMods,
  normalizeMods,
  normalizeProfile,
  profileKey,
  readProfile,
  writeProfile,
};
