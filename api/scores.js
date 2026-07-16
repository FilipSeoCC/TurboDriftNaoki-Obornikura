// Shared leaderboard backed by the Upstash Redis instance connected under
// Vercel Storage. Talks to it directly over the Upstash REST API (no SDK
// dependency needed) using whichever env var names the integration injected.

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

// v2 starts a clean leaderboard after the scoring-system rebalance.
const ZSET_KEY = 'tkd:scores:v2';
const MAX_ENTRIES = 200;
const MAX_NAME_LEN = 16;
const MAX_SCORE = 200000; // line-drift scoring (including x2 zones) stays safely below this cap

async function redis(commands) {
  const isPipeline = Array.isArray(commands[0]);
  const url = REDIS_URL + (isPipeline ? '/pipeline' : '');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REDIS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(isPipeline ? commands : commands),
  });
  if (!res.ok) {
    throw new Error('redis error ' + res.status);
  }
  return res.json();
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Anonim';
  const n = name.replace(/[<>&"'`]/g, '').trim().slice(0, MAX_NAME_LEN);
  return n || 'Anonim';
}

function parseWithScores(flatArr) {
  const out = [];
  for (let i = 0; i < flatArr.length; i += 2) {
    let entry;
    try {
      entry = JSON.parse(flatArr[i]);
    } catch (e) {
      continue;
    }
    out.push({
      name: entry.name || 'Anonim',
      mode: entry.mode === 'rondo' ? 'rondo' : 'osemka',
      score: Math.round(Number(flatArr[i + 1])),
    });
  }
  return out;
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({ error: 'Baza danych nie jest podpięta (brak zmiennych środowiskowych KV).' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const result = await redis([
        ['ZREVRANGE', ZSET_KEY, '0', '4', 'WITHSCORES'],
        ['ZRANGE', ZSET_KEY, '0', '4', 'WITHSCORES'],
      ]);
      const top = parseWithScores(result[0].result || []);
      const bottom = parseWithScores(result[1].result || []);
      res.status(200).json({ top: top, bottom: bottom });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = {};
        }
      }
      body = body || {};

      const name = sanitizeName(body.name);
      const mode = body.mode === 'rondo' ? 'rondo' : 'osemka';
      let score = Number(body.score);
      if (!isFinite(score) || score < 0) {
        res.status(400).json({ error: 'invalid score' });
        return;
      }
      score = Math.min(Math.round(score), MAX_SCORE);

      const member = JSON.stringify({ name: name, mode: mode, t: Date.now(), r: Math.random() });

      await redis([
        ['ZADD', ZSET_KEY, String(score), member],
        ['ZREMRANGEBYRANK', ZSET_KEY, '0', String(-(MAX_ENTRIES + 1))],
      ]);

      const result = await redis([
        ['ZREVRANGE', ZSET_KEY, '0', '4', 'WITHSCORES'],
        ['ZRANGE', ZSET_KEY, '0', '4', 'WITHSCORES'],
      ]);
      const top = parseWithScores(result[0].result || []);
      const bottom = parseWithScores(result[1].result || []);
      res.status(200).json({ top: top, bottom: bottom });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'server error' });
  }
};
