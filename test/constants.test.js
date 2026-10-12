'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { DEBUG } = require('../lib/constants');

test('DEBUG is off, so a release cannot ship verbose logging', () => {
  assert.strictEqual(DEBUG, false);
});
