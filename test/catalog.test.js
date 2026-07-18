'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { listCars, listTracks, assertOwnedCar } = require('../api/_lib/catalog');
const { normalizeProfile } = require('../api/_lib/store');

test('new profile owns starter car and all free tracks', () => {
  const profile = normalizeProfile({});
  assert.deepEqual(profile.ownedCars, ['e36_touring']);
  assert.deepEqual(profile.unlockedTracks.sort(), ['osemka', 'rondo', 'ulica']);
});

test('legacy selected car stays owned during migration', () => {
  const profile = normalizeProfile({ car: 'mazda_mx5', mods: { engine: 2 } });
  assert.equal(profile.ownedCars.includes('mazda_mx5'), true);
  assert.equal(profile.carMods.mazda_mx5.engine, 2);
});

test('car list exposes ownership and selection without leaking mutable catalog state', () => {
  const profile = normalizeProfile({ car: 'e36_touring' });
  const cars = listCars(profile);
  assert.equal(cars.find((car) => car.id === 'e36_touring').selected, true);
  assert.equal(cars.find((car) => car.id === 'mazda_mx5').owned, false);
});

test('locked car cannot be selected', () => {
  const profile = normalizeProfile({});
  assert.deepEqual(assertOwnedCar(profile, 'mazda_mx5'), { ok: false, error: 'car_locked', required: 2500 });
});

test('tracks validate car ownership and mode', () => {
  const profile = normalizeProfile({});
  assert.equal(listTracks(profile, 'e36_touring', 'multiplayer').ok, true);
  assert.equal(listTracks(profile, 'mazda_mx5', 'singleplayer').error, 'car_locked');
  assert.equal(listTracks(profile, 'e36_touring', 'invalid').error, 'invalid_mode');
});
