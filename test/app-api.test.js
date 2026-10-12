'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { requireWithHomey, wait } = require('./support');

function makeApp(createAppAPI) {
  const SwitchSyncApp = requireWithHomey('../app', { 'homey-api': { HomeyAPI: { createAppAPI } } });
  const app = new SwitchSyncApp();
  app.homey = {};
  return app;
}

test('devices that start at the same time share one API client', async () => {
  let created = 0;
  const app = makeApp(async () => { created++; await wait(20); return { id: created }; });

  const clients = await Promise.all(Array.from({ length: 33 }, () => app.getHomeyAPI()));

  assert.strictEqual(created, 1);
  assert.strictEqual(new Set(clients).size, 1);
});

test('a failed attempt is not cached: the next call retries', async () => {
  let calls = 0;
  const app = makeApp(async () => {
    calls++;
    if (calls === 1) throw new Error('Homey not ready');
    return { ok: true };
  });

  await assert.rejects(app.getHomeyAPI(), /Homey not ready/);
  assert.deepStrictEqual(await app.getHomeyAPI(), { ok: true });
  assert.strictEqual(calls, 2);
});
