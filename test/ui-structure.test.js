const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('race setup keeps track and game mode in one screen', () => {
  const setup = html.match(/<div class="screen menu-screen" id="screenTrackSelect"[\s\S]*?<div class="screen menu-screen" id="screenLobby"/);
  assert.ok(setup, 'combined race setup screen should exist before lobby');
  assert.match(setup[0], /id="btnRondo"/);
  assert.match(setup[0], /id="btnOsemka"/);
  assert.match(setup[0], /id="btnUlica"/);
  assert.match(setup[0], /id="btnSingleMode"/);
  assert.match(setup[0], /id="btnMultiMode"/);
  assert.match(setup[0], /id="btnStartRace"/);
  assert.doesNotMatch(html, /id="screenModeSelect"/);
});

test('HTML ids are unique and JavaScript references existing elements', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);

  const references = [...html.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);
  const missing = [...new Set(references.filter(id => !ids.includes(id)))];
  assert.deepEqual(missing, []);
});

test('race choices expose pressed state for keyboard and assistive technology', () => {
  for (const id of ['btnRondo', 'btnOsemka', 'btnUlica', 'btnSingleMode', 'btnMultiMode']) {
    assert.match(html, new RegExp(`id="${id}"[^>]+aria-pressed="(?:true|false)"`));
  }
  assert.match(html, /id="raceSetupSummary"[^>]+aria-live="polite"/);
});
