'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeDevice, wait } = require('./support');

test('_suppressMs falls back to 2000 and honours the group setting', () => {
  assert.strictEqual(makeDevice().device._suppressMs(), 2000);
  assert.strictEqual(makeDevice({ settings: { suppress_ms: 3500 } }).device._suppressMs(), 3500);
});

test('_suppressDevice ignores only the matching value, until the window ends', async () => {
  const { device } = makeDevice();
  device._suppressDevice('a', true, 50);
  assert.strictEqual(device._isSuppressed('a', true), true);
  assert.strictEqual(device._isSuppressed('a', false), false);
  assert.strictEqual(device._isSuppressed('b', true), false);
  await wait(120);
  assert.strictEqual(device._isSuppressed('a', true), false);
});

test('_suppressDevice restarts the window and replaces the value', async () => {
  const { device } = makeDevice();
  device._suppressDevice('a', true, 50);
  device._suppressDevice('a', false, 200);
  await wait(120); // past the first window: its timer must not have cleared the new entry
  assert.strictEqual(device._isSuppressed('a', false), true);
  assert.strictEqual(device._isSuppressed('a', true), false);
  await wait(150);
  assert.strictEqual(device._isSuppressed('a', false), false);
});

test('_addSyncReport fills timestamp, group and Health Check trigger, and lets callers override', () => {
  const { device, reports } = makeDevice();
  device._addSyncReport({ value: null, hasError: true });
  device._addSyncReport({ trigger: 'Master command', value: true });

  assert.strictEqual(reports[0].group, 'Group');
  assert.strictEqual(reports[0].trigger, 'sync.health_check');
  assert.ok(!Number.isNaN(Date.parse(reports[0].timestamp)));
  assert.strictEqual(reports[0].hasError, true);
  assert.strictEqual(reports[1].trigger, 'Master command');
});
