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
      const isNew = !hashes.get(key).has(args[0]);
      hashes.get(key).set(args[0], args[1]);
      return { result: isNew ? 1 : 0 };
    }
    if (name === 'HGETALL') {
      const flat = [];
      for (const [field, value] of (hashes.get(key) || new Map())) flat.push(field, value);
      return { result: flat };
    }
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
    assert.equal((hashes.get('tkd:room:v3:rondo:TEST') || new Map()).size, 0);
  } finally {
    Date.now = originalNow;
  }
});

test('steady-state update is one Redis request and a room can hold 15 players', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const hash = new Map();
  let httpCalls = 0, commandCount = 0;
  function execute(command) {
    const [name, , ...args] = command;
    commandCount++;
    if (name === 'HSET') { const isNew = !hash.has(args[0]); hash.set(args[0], args[1]); return { result: isNew ? 1 : 0 }; }
    if (name === 'HGETALL') { const flat = []; for (const [f, v] of hash) flat.push(f, v); return { result: flat }; }
    if (name === 'GET') return { result: null };
    if (name === 'EXPIRE') return { result: 1 };
    if (name === 'HDEL') { let n = 0; for (const f of args) if (hash.delete(f)) n++; return { result: n }; }
    throw new Error('unsupported Redis command ' + name);
  }
  global.fetch = async (_url, options) => {
    httpCalls++;
    const command = JSON.parse(options.body);
    const result = Array.isArray(command[0]) ? command.map(execute) : execute(command);
    return { ok: true, json: async () => result };
  };
  const originalNow = Date.now, originalRandom = Math.random;
  let now = 500000;
  Date.now = () => now;
  Math.random = () => 0.99; // bez losowego EXPIRE
  delete require.cache[require.resolve('../api/room')];
  const handler = require('../api/room');
  async function post(body) {
    const response = { statusCode: 0, payload: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; } };
    await handler({ method: 'POST', body }, response);
    assert.equal(response.statusCode, 200);
    return response.payload;
  }
  try {
    for (let i = 1; i <= 15; i++) { now += 10; await post({ room: 'BIG', track: 'rondo', action: 'update', id: 'p' + i, name: 'G' + i, x: 0.1, y: 0.2 }); }
    httpCalls = 0; commandCount = 0;
    now += 10;
    const response = await post({ room: 'BIG', track: 'rondo', action: 'update', id: 'p3', name: 'G3', x: 0.3, y: 0.4 });
    assert.equal(httpCalls, 1, 'update should be a single HTTP request');
    assert.equal(commandCount, 3, 'update should be HSET + HGETALL + GET');
    assert.equal(response.players.length, 15, 'all 15 players are visible, not just 8');
    assert.equal(response.players.find((player) => player.id === 'p3').x, 0.3);
  } finally {
    Date.now = originalNow; Math.random = originalRandom;
  }
});

test('ready toggles off, expired player gets 404, object-shaped HGETALL is understood', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const hash = new Map();
  let objectMode = false;
  function execute(command) {
    const [name, , ...args] = command;
    if (name === 'HSET') { const isNew = !hash.has(args[0]); hash.set(args[0], args[1]); return { result: isNew ? 1 : 0 }; }
    if (name === 'HGET') return { result: hash.get(args[0]) || null };
    if (name === 'HGETALL') {
      if (objectMode) return { result: Object.fromEntries(hash) };
      const flat = []; for (const [f, v] of hash) flat.push(f, v); return { result: flat };
    }
    if (name === 'GET') return { result: null };
    if (name === 'SET') return { result: 'OK' };
    if (name === 'EXPIRE') return { result: 1 };
    if (name === 'DEL') return { result: 1 };
    if (name === 'HDEL') { let n = 0; for (const f of args) if (hash.delete(f)) n++; return { result: n }; }
    throw new Error('unsupported Redis command ' + name);
  }
  global.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    return { ok: true, json: async () => (Array.isArray(command[0]) ? command.map(execute) : execute(command)) };
  };
  const originalNow = Date.now;
  let now = 900000;
  Date.now = () => now;
  delete require.cache[require.resolve('../api/room')];
  const handler = require('../api/room');
  async function call(method, body, expected = 200) {
    const response = { statusCode: 0, payload: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; } };
    await handler(method === 'GET' ? { method, query: body } : { method, body }, response);
    assert.equal(response.statusCode, expected);
    return response.payload;
  }
  try {
    const base = { room: 'T2', track: 'rondo', name: 'A', car: 'e36_touring' };
    await call('POST', { ...base, action: 'update', id: 'a' });
    let res = await call('POST', { ...base, action: 'ready', id: 'a' });
    assert.equal(res.players[0].ready, true);
    res = await call('POST', { ...base, action: 'ready', id: 'a' });
    assert.equal(res.players[0].ready, false, 'second click un-readies');
    objectMode = true;
    res = await call('GET', { room: 'T2', track: 'rondo' });
    assert.equal(res.players.length, 1, 'object-shaped HGETALL still parses');
    objectMode = false;
    now += 20000;
    await call('POST', { ...base, action: 'ready', id: 'a' }, 404);
  } finally { Date.now = originalNow; }
});
