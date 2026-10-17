'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeSyncGroup } = require('./support');

// Every health check runs well after the 60 s re-subscribe cooldown.
function nextCycle(group) {
  group.device._lastResubscribeAt -= 61000;
  group.device._healCooldowns.clear();
  return group.device._verifyGroupHealth();
}

test('a device that came back out of step gets the group state, and the group is left alone', async () => {
  const state = { a: false, b: false };
  const group = await makeSyncGroup({ virtual: false, state });

  state.b = true; // it returned still ON after missing the OFF command
  await nextCycle(group);

  assert.deepStrictEqual(group.writes, [['b', false]]);
  assert.strictEqual(group.caps.onoff, false);
});

test('a device that stays out of step is re-subscribed and logged once, not every cycle', async () => {
  const state = { a: false, b: false };
  const group = await makeSyncGroup({ virtual: false, state, failWrites: ['b'] });
  let reloads = 0;
  const reload = group.device.reloadConfiguration.bind(group.device);
  group.device.reloadConfiguration = (...args) => { reloads++; return reload(...args); };
  const reports = [];
  group.device.homey.app.addSyncReport = report => reports.push(report);

  state.b = true; // the heal keeps failing: the device is unreachable
  for (let cycle = 0; cycle < 3; cycle++) await nextCycle(group);

  assert.strictEqual(reloads, 1);
  assert.strictEqual(reports.filter(report => report.hasError).length, 1);
});

test('a command queued for an offline device survives a re-subscribe', async () => {
  const group = await makeSyncGroup({ virtual: false, state: { a: false, b: false } });
  group.device._pendingOffline.set('b', { value: false, timestamp: Date.now() });

  await group.device.reloadConfiguration();

  assert.ok(group.device._pendingOffline.has('b'));
});

test('a device that is unavailable is left alone until it is back', async () => {
  const state = { a: false, b: false };
  const group = await makeSyncGroup({ virtual: false, state });

  state.b = true;
  group.device._listeners.get('b').device.available = false;
  await group.device._verifyGroupHealth();

  assert.deepStrictEqual(group.writes, []);
});
