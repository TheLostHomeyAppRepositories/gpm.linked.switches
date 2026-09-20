'use strict';

module.exports = {
  // Periodic health check interval — safety net for drift not tied to a propagation
  // (e.g. a listener that dies silently with no one toggling the switch afterward).
  HEALTH_INTERVAL_MS: 10 * 60 * 1000,

  // Minimum time between the first and confirming subscribe failure before a
  // device is treated as a ghost (deleted from Homey).
  GHOST_CONFIRM_GAP_MS: 5 * 60 * 1000,

  // Small stagger between writes to avoid Zigbee network congestion.
  // Must stay imperceptible to the user: 30ms per device keeps the whole
  // group under ~270ms even with 10 devices.
  SLAVE_STAGGER_MS: 30,

  // Debounce rapid duplicate capability callbacks (ms)
  CALLBACK_DEBOUNCE_MS: 80,

  // Linked Switch boot sync (global app setting `boot_sync_policy`):
  //   keep_virtual — the group's saved ON/OFF state wins; devices are aligned to it
  //   any_on_wins  — if any device is ON at boot the group becomes ON
  BOOT_SYNC_POLICIES: ['keep_virtual', 'any_on_wins'],
  DEFAULT_BOOT_SYNC_POLICY: 'keep_virtual',
};
