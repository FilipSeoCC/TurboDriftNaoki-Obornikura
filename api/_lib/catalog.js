'use strict';

const GAME_MODES = Object.freeze(['singleplayer', 'multiplayer']);

const CARS = Object.freeze([
  Object.freeze({ id: 'e36_touring', name: 'Fioletowy Touring E36', body: 'touring', hp: 450, nm: 550, stockBoost: 'turbo', unlockCost: 0 }),
  Object.freeze({ id: 'e36_bodykit', name: 'BMW E36 Sedan · Czarne', body: 'sedan', hp: 370, nm: 500, stockBoost: 'naturally_aspirated', unlockCost: 3000 }),
  Object.freeze({ id: 'e36_m3', name: 'BMW E36 Coupé · Srebrne', body: 'coupe', hp: 320, nm: 360, stockBoost: 'naturally_aspirated', unlockCost: 4500 }),
  Object.freeze({ id: 'mazda_mx5', name: 'Mazda MX-5', body: 'roadster', hp: 200, nm: 210, stockBoost: 'naturally_aspirated', unlockCost: 2500 }),
  Object.freeze({ id: 'bmw_e46_checker', name: 'E46 Coorvibonk', body: 'coupe', hp: 230, nm: 300, stockBoost: 'naturally_aspirated', unlockCost: 4000 }),
]);

const TRACKS = Object.freeze([
  Object.freeze({ id: 'rondo', name: 'Rondo', difficulty: 1, idealLapSeconds: 14, supportedModes: GAME_MODES, unlockCost: 0 }),
  Object.freeze({ id: 'osemka', name: 'Pentagram', difficulty: 2, idealLapSeconds: 18, supportedModes: GAME_MODES, unlockCost: 0 }),
  Object.freeze({ id: 'ulica', name: 'Uliczny', difficulty: 3, idealLapSeconds: 22, supportedModes: GAME_MODES, unlockCost: 0 }),
]);

const CAR_BY_ID = new Map(CARS.map((car) => [car.id, car]));
const TRACK_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));

function uniqueKnownCars(value, selectedCar) {
  const owned = new Set(['e36_touring']);
  if (Array.isArray(value)) value.forEach((id) => { if (CAR_BY_ID.has(id)) owned.add(id); });
  if (CAR_BY_ID.has(selectedCar)) owned.add(selectedCar);
  return Array.from(owned);
}

function uniqueKnownTracks(value) {
  const unlocked = new Set(TRACKS.filter((track) => track.unlockCost === 0).map((track) => track.id));
  if (Array.isArray(value)) value.forEach((id) => { if (TRACK_BY_ID.has(id)) unlocked.add(id); });
  return Array.from(unlocked);
}

function listCars(profile) {
  const owned = new Set(uniqueKnownCars(profile && profile.ownedCars, profile && profile.car));
  return CARS.map((car) => Object.assign({}, car, { owned: owned.has(car.id), selected: profile && profile.car === car.id }));
}

function assertOwnedCar(profile, carId) {
  if (!CAR_BY_ID.has(carId)) return { ok: false, error: 'invalid_car' };
  const owned = uniqueKnownCars(profile && profile.ownedCars, profile && profile.car);
  if (!owned.includes(carId)) return { ok: false, error: 'car_locked', required: CAR_BY_ID.get(carId).unlockCost };
  return { ok: true, car: CAR_BY_ID.get(carId) };
}

function listTracks(profile, carId, mode) {
  const carCheck = assertOwnedCar(profile, carId);
  if (!carCheck.ok) return carCheck;
  if (!GAME_MODES.includes(mode)) return { ok: false, error: 'invalid_mode' };
  const unlocked = new Set(uniqueKnownTracks(profile && profile.unlockedTracks));
  return {
    ok: true,
    car: carId,
    mode,
    tracks: TRACKS.filter((track) => track.supportedModes.includes(mode)).map((track) => Object.assign({}, track, { unlocked: unlocked.has(track.id) })),
  };
}

module.exports = {
  CARS,
  TRACKS,
  GAME_MODES,
  CAR_BY_ID,
  TRACK_BY_ID,
  uniqueKnownCars,
  uniqueKnownTracks,
  listCars,
  listTracks,
  assertOwnedCar,
};
