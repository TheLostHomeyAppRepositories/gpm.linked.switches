'use strict';

const Module = require('module');

// The `homey` module only exists inside the Homey runtime; stub just enough of Device.
class FakeDevice {
  getName() { return 'Group'; }
  getSetting(key) { return this.settings ? this.settings[key] : undefined; }
  log() {}
}
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'homey' ? { Device: FakeDevice } : load.call(this, request, ...rest);
};
const LinkedGroupDevice = require('../lib/LinkedGroupDevice');
Module._load = load;

function makeDevice({ settings } = {}) {
  const device = new LinkedGroupDevice();
  const reports = [];
  device.settings = settings;
  device.homey = {
    setTimeout,
    clearTimeout,
    __: key => key,
    app: { addSyncReport: report => reports.push(report) },
  };
  device._initGroupState();
  return { device, reports };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { makeDevice, wait };
