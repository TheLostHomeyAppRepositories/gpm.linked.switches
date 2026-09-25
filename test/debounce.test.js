'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeDevice, wait } = require('./support');

test('a fast ON then OFF delivers only OFF (stale ON timer is dropped)', async () => {
  const { device } = makeDevice();
  const seen = [];
  device._debouncedCallback('a', true, v => seen.push(v));
  device._debouncedCallback('a', false, v => seen.push(v));
  await wait(200);
  assert.deepStrictEqual(seen, [false]);
});

test('repeated identical values collapse into one delivery', async () => {
  const { device } = makeDevice();
  const seen = [];
  device._debouncedCallback('a', true, v => seen.push(v));
  device._debouncedCallback('a', true, v => seen.push(v));
  await wait(200);
  assert.deepStrictEqual(seen, [true]);
});
