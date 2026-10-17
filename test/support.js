'use strict';

const Module = require('module');

// The `homey` module only exists inside the Homey runtime; stub just enough of it.
class FakeDevice {
  getName() { return 'Group'; }
  getSetting(key) { return this.settings ? this.settings[key] : undefined; }
  log() {}
}
class FakeDriver {
  log() {}
  error() {}
}
class FakeApp {
  log() {}
  error() {}
}
const load = Module._load;

// Requires a module with `require('homey')` resolved to the stubs above. `stubs` replaces
// other modules by name (for example `{ 'homey-api': { HomeyAPI: ... } }`).
function requireWithHomey(modulePath, stubs = {}) {
  Module._load = function (request, ...rest) {
    if (request === 'homey') return { Device: FakeDevice, Driver: FakeDriver, App: FakeApp };
    if (request in stubs) return stubs[request];
    return load.call(this, request, ...rest);
  };
  // A module loaded with stubs must not be reused by the next test.
  if (Object.keys(stubs).length > 0) delete require.cache[require.resolve(modulePath)];
  try {
    return require(modulePath);
  } finally {
    Module._load = load;
  }
}

const LinkedGroupDevice = requireWithHomey('../lib/LinkedGroupDevice');

// Long timers (verify, health check) are unref'd so they never keep the test run alive;
// short ones stay ref'd so a test awaiting a stagger or a write is not cut off.
const unrefTimeout = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  if (ms >= 1000) timer.unref();
  return timer;
};
const unrefInterval = (fn, ms) => setInterval(fn, ms).unref();

function makeDevice({ settings } = {}) {
  const device = new LinkedGroupDevice();
  const reports = [];
  device.settings = settings;
  device.homey = {
    setTimeout: unrefTimeout,
    clearTimeout,
    setInterval: unrefInterval,
    clearInterval,
    __: key => key,
    app: { addSyncReport: report => reports.push(report) },
  };
  device._initGroupState();
  return { device, reports };
}

// A Linked Switch group over fake devices. `state` holds each device's current onoff value
// (mutate it to simulate a device changing); `writes` records every write sent to a device.
async function makeSyncGroup({ virtual = null, state, store = {}, missing = [], failWrites = [] }) {
  const SwitchSyncDevice = require('../drivers/switch-sync/device');
  const writes = [];
  const storeData = { deviceIds: Object.keys(state), ...store };
  const caps = { onoff: virtual };

  const api = { devices: { getDevice: async ({ id }) => {
    if (missing.includes(id)) throw new Error('device not found');
    return {
    id,
    name: id,
    available: true,
    makeCapabilityInstance: () => ({ get value() { return state[id]; }, destroy() {} }),
    setCapabilityValue: async ({ value }) => {
      if (failWrites.includes(id)) throw new Error('This device is currently unavailable.');
      writes.push([id, value]);
    },
    };
  } } };

  const device = new SwitchSyncDevice();
  const { device: base } = makeDevice();
  Object.assign(device, {
    homey: {
      ...base.homey,
      settings: { get: () => undefined },
      flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) },
      app: { ...base.homey.app, getHomeyAPI: async () => api, _isSettingEnabled: (v, d) => (v == null ? d : Boolean(v)) },
    },
    getStoreValue: key => storeData[key],
    setStoreValue: async (key, value) => { storeData[key] = value; },
    getCapabilityValue: key => (caps[key] === undefined ? null : caps[key]),
    setCapabilityValue: async (key, value) => { caps[key] = value; },
    hasCapability: () => false,
    getCapabilities: () => [],
    addCapability: async () => {},
    removeCapability: async () => {},
    setCapabilityOptions: async () => {},
    setSettings: async () => {},
    setAvailable: async () => {},
    setUnavailable: async () => {},
    registerCapabilityListener: () => {},
    error: () => {},
  });
  await device.onInit();
  device._disposeGroupState();
  return { device, writes, caps, storeData };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { makeDevice, makeSyncGroup, requireWithHomey, wait };
