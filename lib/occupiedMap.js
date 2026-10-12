'use strict';

const GROUP_DRIVER_IDS = ['switch-sync', 'switch-master'];

// Maps each physical device id to the groups already using it, as
// { name, role: 'master' | 'member', driverId, groupId }. `excludeHomeyDeviceId`
// leaves one group out (the group being repaired).
function buildOccupiedMap(homey, excludeHomeyDeviceId = null) {
  const occupied = new Map();
  const markOccupied = (id, entry) => {
    const current = occupied.get(id) || [];
    current.push(entry);
    occupied.set(id, current);
  };

  for (const driverId of GROUP_DRIVER_IDS) {
    let driver;
    try {
      driver = homey.drivers.getDriver(driverId);
    } catch (_) {
      continue;
    }

    for (const device of driver.getDevices()) {
      if (excludeHomeyDeviceId && device.getId() === excludeHomeyDeviceId) continue;
      const name = device.getName();
      const groupId = device.getId();
      const masterId = device.getStoreValue('masterDeviceId');
      if (masterId) {
        markOccupied(masterId, { name, role: 'master', driverId, groupId });
      }

      for (const id of (device.getStoreValue('deviceIds') || []).filter(Boolean)) {
        markOccupied(id, { name, role: 'member', driverId, groupId });
      }
    }
  }
  return occupied;
}

module.exports = { buildOccupiedMap };
