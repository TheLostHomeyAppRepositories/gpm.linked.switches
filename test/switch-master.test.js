'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeDevice, requireWithHomey, wait } = require('./support');

const SwitchMasterDevice = requireWithHomey('../drivers/switch-master/device');

// A Switch Master over fake slaves. `slaves` maps id -> { available, value, delay }:
// `delay(call)` may return a promise to make that slave's n-th write slow. `sent` records
// every write in the order it was dispatched.
function makeMaster(slaves) {
  const master = new SwitchMasterDevice();
  const { device: base } = makeDevice();
  const sent = [];
  const calls = {};

  Object.assign(master, {
    homey: { ...base.homey, settings: { get() {} }, app: { ...base.homey.app, _isSettingEnabled: (v, d) => d } },
    getStoreValue: key => (key === 'deviceIds' ? Object.keys(slaves) : undefined),
    hasCapability: () => false,
    getCapabilityValue: () => null,
    setCapabilityValue: async () => {},
    error: () => {},
  });
  master._initGroupState();
  master._slaves = new Map();
  master._deviceNames = new Map();
  master._pendingErrorReports = new Map();
  master._missedWrites = new Map();

  for (const [id, config] of Object.entries(slaves)) {
    master._slaves.set(id, {
      onoffInstance: { value: config.value === undefined ? null : config.value },
      device: {
        name: id,
        available: config.available !== false,
        setCapabilityValue: async ({ value }) => {
          calls[id] = (calls[id] || 0) + 1;
          sent.push([id, value]);
          if (config.delay) await config.delay(calls[id]);
        },
      },
    });
  }
  return { master, sent };
}

const lastValues = sent => Object.fromEntries(sent);

test('two quick toggles with a slow slave still end with every slave on the last value', async () => {
  const { master, sent } = makeMaster({
    s0: {},
    s1: { delay: call => (call === 1 ? wait(300) : undefined) },
    s2: {},
    s3: {},
  });

  const first = master._setAllSlaves(true, 'virtual master');
  await wait(50);
  const second = master._setAllSlaves(false, 'virtual master');
  await Promise.all([first, second]);

  assert.deepStrictEqual(lastValues(sent), { s0: false, s1: false, s2: false, s3: false });
});

test('a slave that was unavailable gets the command it missed once it is back', async () => {
  const { master, sent } = makeMaster({ s0: {}, s1: { available: false, value: true }, s2: {} });

  await master._setAllSlaves(false, 'virtual master');
  assert.deepStrictEqual(sent.map(([id]) => id), ['s0', 's2'], 'nothing is sent to the unavailable slave');

  master._slaves.get('s1').device.available = true;
  await master._flushMissedWrites();

  assert.deepStrictEqual(sent[sent.length - 1], ['s1', false]);
  assert.strictEqual(master._missedWrites.size, 0);
});

test('a missed command is not sent when the slave already has that value', async () => {
  const { master, sent } = makeMaster({ s0: {}, s1: { available: false, value: false } });

  await master._setAllSlaves(false, 'virtual master');
  master._slaves.get('s1').device.available = true;
  await master._flushMissedWrites();

  assert.deepStrictEqual(sent.map(([id]) => id), ['s0']);
});

test('a missed command is dropped after an hour', async () => {
  const { master, sent } = makeMaster({ s0: {}, s1: { available: false, value: true } });

  await master._setAllSlaves(false, 'virtual master');
  master._missedWrites.get('s1').timestamp -= 61 * 60 * 1000;
  master._slaves.get('s1').device.available = true;
  await master._flushMissedWrites();

  assert.deepStrictEqual(sent.map(([id]) => id), ['s0']);
  assert.strictEqual(master._missedWrites.size, 0);
});

test('a newer command replaces a missed one', async () => {
  const { master, sent } = makeMaster({ s0: {}, s1: { available: false, value: true } });

  await master._setAllSlaves(false, 'virtual master'); // s1 misses OFF
  master._slaves.get('s1').device.available = true;
  await master._setAllSlaves(true, 'virtual master'); // s1 is back and gets ON
  await master._flushMissedWrites();

  assert.deepStrictEqual(lastValues(sent), { s0: true, s1: true });
  assert.strictEqual(master._missedWrites.size, 0);
});

test('a slave that times out does not delay the others', async () => {
  let s0Done = false;
  let s1StartedWhileS0Pending = null;
  const { master, sent } = makeMaster({
    s0: { delay: async () => { await wait(300); s0Done = true; } },
    s1: { delay: () => { s1StartedWhileS0Pending = !s0Done; } },
  });

  await master._setAllSlaves(true, 'virtual master');

  assert.strictEqual(s1StartedWhileS0Pending, true);
  assert.strictEqual(s0Done, true);
  assert.strictEqual(sent.length, 2);
});
