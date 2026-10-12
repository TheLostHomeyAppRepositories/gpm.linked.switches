'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeSyncGroup, wait } = require('./support');

test('app start: devices that differ are set to the saved group state', async () => {
  const on = await makeSyncGroup({ virtual: true, state: { a: false, b: false } });
  assert.deepStrictEqual(on.writes, [['a', true], ['b', true]]);
  assert.strictEqual(on.caps.onoff, true);

  const off = await makeSyncGroup({ virtual: false, state: { a: true, b: false } });
  assert.deepStrictEqual(off.writes, [['a', false]]);
  assert.strictEqual(off.caps.onoff, false);
});

test('a just-paired group adopts its devices even if onoff already reads false', async () => {
  const group = await makeSyncGroup({
    virtual: false,
    state: { a: true, b: true },
    store: { pendingInitialSync: true },
  });
  assert.strictEqual(group.caps.onoff, true);
  assert.deepStrictEqual(group.writes, []);
  assert.strictEqual(group.storeData.pendingInitialSync, false);
});

test('a group with no saved state adopts its devices', async () => {
  const group = await makeSyncGroup({ virtual: null, state: { a: true, b: false } });
  assert.strictEqual(group.caps.onoff, true);
  assert.deepStrictEqual(group.writes, [['b', true]]);
});

test('health-check re-subscribe never changes the group or its devices (failed OFF stays OFF)', async () => {
  const state = { a: false, b: false };
  const group = await makeSyncGroup({ virtual: false, state });

  state.a = true; // an OFF write timed out: the device is still ON
  await group.device.reloadConfiguration();

  assert.strictEqual(group.caps.onoff, false);
  assert.deepStrictEqual(group.writes, []);
});

test('Repair re-subscribe aligns devices to the saved group state', async () => {
  const state = { a: false, b: false };
  const group = await makeSyncGroup({ virtual: false, state });

  state.a = true;
  await group.device.reloadConfiguration({ align: true });

  assert.strictEqual(group.caps.onoff, false);
  assert.deepStrictEqual(group.writes, [['a', false]]);
});

test('a Primary changed by Repair is used right away', async () => {
  const group = await makeSyncGroup({ virtual: false, state: { a: false, b: false, c: false }, store: { primaryDeviceId: 'a' } });
  assert.strictEqual(group.device._primaryDeviceId, 'a');

  group.storeData.primaryDeviceId = 'c';
  await group.device.reloadConfiguration({ align: true });
  assert.strictEqual(group.device._primaryDeviceId, 'c');

  const order = [];
  for (const id of ['a', 'b', 'c']) {
    group.device._listeners.get(id).device.setCapabilityValue = async () => { order.push(id); };
  }
  await group.device._propagateNow(true, null);
  assert.strictEqual(order[0], 'c');
});

test('a slow device does not hold back the ones after it', async () => {
  const group = await makeSyncGroup({ virtual: false, state: { a: false, b: false, c: false } });
  let bDone = false;
  let cStartedWhileBPending = null;
  for (const id of ['a', 'b', 'c']) {
    group.device._listeners.get(id).device.setCapabilityValue = async () => {
      if (id === 'c') cStartedWhileBPending = !bDone;
      if (id === 'b') { await wait(300); bDone = true; }
    };
  }

  await group.device._propagateNow(true, null);

  assert.strictEqual(cStartedWhileBPending, true);
  assert.strictEqual(bDone, true, 'propagation still waits for every write before it returns');
});

test('a device missing from Homey is removed only after a second failure, 5+ minutes later', async () => {
  const group = await makeSyncGroup({
    virtual: false,
    state: { a: false, b: false },
    missing: ['c'],
    store: { deviceIds: ['a', 'b', 'c'] },
  });
  assert.deepStrictEqual(group.storeData.deviceIds, ['a', 'b', 'c'], 'first failure only records it');

  await group.device.reloadConfiguration();
  assert.deepStrictEqual(group.storeData.deviceIds, ['a', 'b', 'c'], 'a second failure too soon does not remove it');

  group.device._subscribeFailures.get('c').firstFailAt -= 6 * 60 * 1000;
  await group.device.reloadConfiguration();
  assert.deepStrictEqual(group.storeData.deviceIds, ['a', 'b']);
});
