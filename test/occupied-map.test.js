'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildOccupiedMap } = require('../lib/occupiedMap');

function group(id, name, store) {
  return { getId: () => id, getName: () => name, getStoreValue: key => store[key] };
}

const homey = {
  drivers: {
    getDriver(driverId) {
      if (driverId === 'switch-sync') return { getDevices: () => [group('g1', 'Hall', { deviceIds: ['a', 'b'] })] };
      if (driverId === 'switch-master') return { getDevices: () => [group('g2', 'Deck', { masterDeviceId: 'm', deviceIds: ['a', 'c'] })] };
      throw new Error('unknown driver');
    },
  },
};

test('maps each physical device to the groups using it, with its role', () => {
  const occupied = buildOccupiedMap(homey);
  assert.deepStrictEqual(occupied.get('m'), [{ name: 'Deck', role: 'master', driverId: 'switch-master', groupId: 'g2' }]);
  assert.deepStrictEqual(occupied.get('a').map(e => [e.name, e.role, e.driverId]), [
    ['Hall', 'member', 'switch-sync'],
    ['Deck', 'member', 'switch-master'],
  ]);
  assert.strictEqual(occupied.get('zzz'), undefined);
});

test('leaves out the group being repaired', () => {
  const occupied = buildOccupiedMap(homey, 'g1');
  assert.deepStrictEqual(occupied.get('a').map(e => e.name), ['Deck']);
  assert.strictEqual(occupied.get('b'), undefined);
});

test('a driver that cannot be loaded is skipped', () => {
  const partial = { drivers: { getDriver(id) { if (id === 'switch-master') throw new Error('x'); return homey.drivers.getDriver(id); } } };
  assert.deepStrictEqual([...buildOccupiedMap(partial).keys()].sort(), ['a', 'b']);
});
