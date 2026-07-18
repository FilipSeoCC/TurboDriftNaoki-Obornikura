const test = require('node:test');
const assert = require('node:assert/strict');

test('delete_profile deletes only the complete profile key and returns an empty profile', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  delete require.cache[require.resolve('../api/_lib/store')];
  delete require.cache[require.resolve('../api/profile')];

  const commands = [];
  global.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    commands.push(command);
    if (command[0] === 'GET') {
      return { ok: true, json: async () => ({ result: JSON.stringify({ currency: 4200, car: 'mazda_mx5', carMods: { mazda_mx5: { engine: 3 } } }) }) };
    }
    return { ok: true, json: async () => ({ result: 1 }) };
  };

  const handler = require('../api/profile');
  const req = { method: 'POST', body: { name: 'Testowy', action: 'delete_profile' } };
  const response = {
    statusCode: 0,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };

  await handler(req, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(commands, [
    ['GET', 'tkd:profile:testowy'],
    ['DEL', 'tkd:profile:testowy'],
  ]);
  assert.equal(response.payload.currency, 0);
  assert.equal(response.payload.car, 'e36_touring');
  assert.equal(response.payload.shareRewarded, false);
  assert.deepEqual(response.payload.carMods.e36_touring, {
    engine: 0,
    turbo: 0,
    supercharger: 0,
    injectors: 0,
    fuelpump: 0,
    clutch: 0,
    gearbox: 0,
    tires: 0,
  });
});
