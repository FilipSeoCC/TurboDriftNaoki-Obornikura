const test = require('node:test');
const assert = require('node:assert/strict');

test('ready players receive one shared countdown and update preserves readiness', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

  const hashes = new Map();
  const strings = new Map();
  let raceSetCalls = 0;

  function execute(command) {
    const [name, key, ...args] = command;
    if (name === 'HGET') return { result: (hashes.get(key) || new Map()).get(args[0]) || null };
    if (name === 'HSET') {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(args[0], args[1]);
      return { result: 1 };
    }
    if (name === 'HVALS') return { result: Array.from((hashes.get(key) || new Map()).values()) };
    if (name === 'HDEL') {
      const hash = hashes.get(key);
      let deleted = 0;
      for (const field of args) if (hash && hash.delete(field)) deleted++;
      return { result: deleted };
    }
    if (name === 'GET') return { result: strings.get(key) || null };
    if (name === 'SET') {
      raceSetCalls++;
      const nx = args.includes('NX');
      if (nx && strings.has(key)) return { result: null };
      strings.set(key, args[0]);
      return { result: 'OK' };
    }
    if (name === 'DEL') return { result: strings.delete(key) ? 1 : 0 };
    if (name === 'EXPIRE') return { result: 1 };
    throw new Error('unsupported Redis command ' + name);
  }

  global.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    const result = Array.isArray(command[0]) ? command.map(execute) : execute(command);
    return { ok: true, json: async () => result };
  };

  let now = 100000;
  const originalNow = Date.now;
  Date.now = () => now;
  const handler = require('../api/room');

  async function request(method, body) {
    const response = {
      statusCode: 0,
      payload: null,
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    const req = method === 'GET'
      ? { method, query: body }
      : { method, body };
    await handler(req, response);
    assert.equal(response.statusCode, 200);
    return response.payload;
  }

  try {
    const base = { room: 'TEST', track: 'rondo', action: 'update', name: 'Gracz', car: 'e36_touring', x: 0.5, y: 0.5 };
    let response = await request('POST', { ...base, id: 'p1' });
    assert.deepEqual(response.race, { status: 'waiting', startAt: null });
    assert.equal(response.players[0].ready, false);

    await request('POST', { ...base, id: 'p2' });
    response = await request('POST', { room: 'TEST', track: 'rondo', action: 'ready', id: 'p1' });
    assert.equal(response.race.status, 'waiting');

    response = await request('POST', { room: 'TEST', track: 'rondo', action: 'ready', id: 'p2' });
    assert.deepEqual(response.race, { status: 'countdown', startAt: 105000 });

    now = 101000;
    response = await request('GET', { room: 'TEST', track: 'rondo' });
    assert.deepEqual(response.race, { status: 'countdown', startAt: 105000 });

    response = await request('POST', { ...base, id: 'p1', x: 0.7 });
    assert.equal(response.players.find((player) => player.id === 'p1').ready, true);
    assert.equal(response.race.startAt, 105000);

    now = 106000;
    response = await request('GET', { room: 'TEST', track: 'rondo' });
    assert.deepEqual(response.race, { status: 'racing', startAt: 105000 });
    assert.equal(raceSetCalls, 1);

    for (const pollTime of [111000, 121000, 131000, 141000, 151000]) {
      now = pollTime;
      await request('POST', { ...base, id: 'p1' });
      await request('POST', { ...base, id: 'p2' });
    }
    now = 156000;
    response = await request('GET', { room: 'TEST', track: 'rondo' });
    assert.deepEqual(response.race, { status: 'waiting', startAt: null });
    assert.equal(response.players.every((player) => player.ready === false), true);

    await request('POST', { room: 'TEST', track: 'rondo', action: 'leave', id: 'p1' });
    await request('POST', { room: 'TEST', track: 'rondo', action: 'leave', id: 'p2' });
    assert.equal(strings.has('tkd:room:race:v1:rondo:TEST'), false);
  } finally {
    Date.now = originalNow;
  }
});
