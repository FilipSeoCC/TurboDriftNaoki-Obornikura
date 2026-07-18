# Kontrakt logiki gry i backendu

Wszystkie odpowiedzi są JSON. Nick (`name`) jest obecnie kluczem współdzielonego profilu, a nie bezpiecznym uwierzytelnieniem.

## `GET /api/game`

Parametry wspólne: `name` oraz `resource`.

- `resource=bootstrap` — `{ selectedCar, cars, tracks, modes }` do zasilenia całego flow.
- `resource=cars` — `{ selectedCar, cars }`; każdy samochód ma `id`, statystyki, `unlockCost`, `owned`, `selected`.
- `resource=tracks&car=<id>&mode=<singleplayer|multiplayer>` — `{ ok, car, mode, tracks }`; każdy tor ma `unlocked` i `supportedModes`.
- `resource=modes` — `{ modes: [{ id, available }] }`.
- `resource=lobby&code=<kod>` — `{ lobby: { code, track, mode, maxPlayers, players } }` albo `404 lobby_not_found`.

## `POST /api/game`

- Wybór posiadanego auta:
  - wejście: `{ action: "select_car", name, car }`
  - wyjście: `{ selectedCar, car }`
  - błędy: `invalid_car`, `car_locked`.
- Walidacja kompletnego wyboru przed startem:
  - wejście: `{ action: "validate_selection", name, car, track, mode }`
  - wyjście: `{ valid: true, selection: { car, track, mode } }`
  - błędy: `car_locked`, `invalid_track`, `track_locked`, `invalid_mode`.
- Utworzenie lobby:
  - wejście: `{ action: "create_lobby", name, playerId, car, track }`
  - wyjście `201`: `{ lobby }`.
- Dołączenie do lobby:
  - wejście: `{ action: "join_lobby", name, code, playerId, car, track }`
  - wyjście: `{ lobby }`
  - błędy: `lobby_full`, `track_mismatch`, walidacja auta/toru.
- Wyjście z lobby:
  - wejście: `{ action: "leave_lobby", code, playerId }`
  - wyjście: `{ ok: true }`.

Lobby mieści maksymalnie 8 graczy i wygasa po 5 minutach braku aktywności. Sam wyścig nadal korzysta z istniejącego `/api/room` do przesyłania pozycji.

## `POST /api/profile`

Istniejące akcje pozostają zgodne. Dodatkowo:

- `select_car` odrzuca samochód, którego profil nie posiada.
- `unlock_car`: `{ action: "unlock_car", name, car }` pobiera `unlockCost` i dopisuje auto do `ownedCars`.
- tuning pozostaje zapisany osobno w `carMods[carId]` i nie można tuningować nieposiadanego auta.

Starszy profil zachowuje aktualnie wybrany samochód jako posiadany, więc migracja nie odbiera graczowi auta ani tuningu.

## `GET /api/casino`

`GET /api/casino?name=<nick>` zwraca:

```json
{
  "currency": 1000,
  "history": [],
  "rules": { "game": "slots", "minStake": 10, "maxStake": 5000, "payouts": {} }
}
```

## `POST /api/casino`

Wejście:

```json
{ "action": "spin", "name": "gracz", "spinId": "unikalne_8_64_znaki", "stake": 100 }
```

Wyjście:

```json
{
  "currency": 1200,
  "duplicate": false,
  "spin": {
    "spinId": "unikalne_8_64_znaki",
    "stake": 100,
    "symbols": ["cherry", "cherry", "cherry"],
    "multiplier": 3,
    "payout": 300,
    "net": 200,
    "createdAt": "2026-07-18T12:00:00.000Z"
  }
}
```

`spinId` jest kluczem idempotencji. Ponowienie identycznego żądania w ciągu 24 godzin zwraca pierwotny wynik z `duplicate: true` i nie pobiera stawki ponownie. Sprawdzenie salda, zapis wyniku, zmiana waluty i historia są wykonywane jednym atomowym skryptem Redis. Historia przechowuje ostatnie 20 spinów.

Możliwe błędy: `invalid_spin_id`, `invalid_stake`, `not_enough_currency`.
