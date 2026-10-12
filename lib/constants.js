'use strict';

module.exports = {
  // Development only: set to true to write verbose [debug] lines to the app console
  // (visible with `homey app run`). Keep false in releases.
  DEBUG: false,

  // Periodic health check interval — safety net for drift not tied to a propagation
  // (e.g. a listener that dies silently with no one toggling the switch afterward).
  HEALTH_INTERVAL_MS: 10 * 60 * 1000,

  // Minimum time between the first and confirming subscribe failure before a
  // device is treated as a ghost (deleted from Homey).
  GHOST_CONFIRM_GAP_MS: 5 * 60 * 1000,

  // Small gap between consecutive writes to avoid Zigbee network congestion.
  // Must stay imperceptible to the user: a constant 30ms gap keeps the whole
  // group under ~270ms even with 10 devices.
  SLAVE_STAGGER_MS: 30,

  // Debounce rapid duplicate capability callbacks (ms)
  CALLBACK_DEBOUNCE_MS: 80,

  // Commands a device missed while unavailable are dropped after this long.
  PENDING_OFFLINE_TTL_MS: 60 * 60 * 1000,

  // Most devices one Linked Switch group can hold (fits a phone screen without scrolling).
  MAX_LINKED_DEVICES: 10,
};
