'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// The `homey` module only exists inside the Homey runtime; stub just enough of Device.
class FakeDevice {
  getName() { return 'Group'; }
  log() {}
}
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'homey' ? { Device: FakeDevice } : load.call(this, request, ...rest);
};
const LinkedGroupDevice = require('../lib/LinkedGroupDevice');
Module._load = load;

function makeDevice() {
  const device = new LinkedGroupDevice();
  device.homey = { setTimeout, clearTimeout };
  device._initGroupState();
  return device;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('a fast ON then OFF delivers only OFF (stale ON timer is dropped)', async () => {
  const device = makeDevice();
  const seen = [];
  device._debouncedCallback('a', true, v => seen.push(v));
  device._debouncedCallback('a', false, v => seen.push(v));
  await wait(200);
  assert.deepStrictEqual(seen, [false]);
});

test('repeated identical values collapse into one delivery', async () => {
  const device = makeDevice();
  const seen = [];
  device._debouncedCallback('a', true, v => seen.push(v));
  device._debouncedCallback('a', true, v => seen.push(v));
  await wait(200);
  assert.deepStrictEqual(seen, [true]);
});
