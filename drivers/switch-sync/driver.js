'use strict';

const { Driver } = require('homey');

class SwitchSyncDriver extends Driver {

  async onInit() {
    this.log('SwitchSyncDriver initialized');

    this.homey.flow.getConditionCard('group_is_synced')
      .registerRunListener(async (args) => args.device.isGroupSynced());
    this.homey.flow.getConditionCard('group_pending_offline')
      .registerRunListener(async (args) => args.device.isGroupPendingOffline());
    this.homey.flow.getActionCard('force_resync')
      .registerRunListener(async (args) => { await args.device.forceResync(); });
  }

  // Returns a Map of deviceId → groupName for all devices already in a group.
  // Optionally excludes one group by its Homey device id (for repair).
  _buildOccupiedMap(excludeHomeyDeviceId = null) {
    const occupied = new Map(); // physicalDeviceId → { name, role }
    const driverIds = ['switch-sync', 'switch-master'];
    const markOccupied = (id, name, role) => {
      const current = occupied.get(id);
      if (!current || current.role !== 'member' || role === 'member') {
        occupied.set(id, { name, role });
      }
    };

    for (const driverId of driverIds) {
      let driver;
      try {
        driver = this.homey.drivers.getDriver(driverId);
      } catch (_) {
        continue;
      }

      for (const device of driver.getDevices()) {
        if (excludeHomeyDeviceId && device.getId() === excludeHomeyDeviceId) continue;
        const name = device.getName();
        const masterId = device.getStoreValue('masterDeviceId');
        if (masterId) {
          markOccupied(masterId, name, 'master');
        }

        for (const id of (device.getStoreValue('deviceIds') || []).filter(Boolean)) {
          markOccupied(id, name, 'member');
        }
      }
    }
    return occupied;
  }

  async onPair(session) {
    let pendingConfig = null;

    session.setHandler('get_available_devices', async () => {
      try {
        const devices = await this.homey.app.getDevicesWithOnOff();
        this.log(`get_available_devices: found ${devices.length} devices`);
        return devices;
      } catch (err) {
        this.error(`get_available_devices error: ${err.message}`, err);
        throw err;
      }
    });

    session.setHandler('configure_binding', async (config) => {
      // Validate: no device already belongs to another LinkSwitch group
      const occupied = this._buildOccupiedMap();
      const conflicts = (config.deviceIds || []).filter(id => occupied.has(id));
      if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map(id => occupied.get(id).name))];
        throw new Error(
          this.homey.__('pair.err_device_conflict').replace('{names}', names.join('", "'))
        );
      }
      pendingConfig = config;
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!pendingConfig) return [];
      return [{
        name: pendingConfig.name,
        data: { id: `binding_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
        store: { deviceIds: pendingConfig.deviceIds },
        settings: {
          suppress_ms: 2000,
          debug: false,
          linked_devices_info: 'Pending sync...',
        },
      }];
    });
  }

  async onRepair(session, device) {
    session.setHandler('get_available_devices', async () => {
      return this.homey.app.getDevicesWithOnOff();
    });

    session.setHandler('get_config', async () => {
      return {
        deviceIds: device.getStoreValue('deviceIds') || [],
      };
    });

    session.setHandler('save_config', async (config) => {
      const ids = config.deviceIds;
      if (!Array.isArray(ids) || ids.length < 2)
        throw new Error(this.homey.__('repair.err_min2'));
      const unique = [...new Set(ids)];

      // Validate: no device already belongs to another LinkSwitch group (excluding this one)
      const occupied = this._buildOccupiedMap(device.getId());
      const conflicts = unique.filter(id => occupied.has(id));
      if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map(id => occupied.get(id).name))];
        throw new Error(
          this.homey.__('repair.err_device_conflict').replace('{names}', names.join('", "'))
        );
      }

      await device.setStoreValue('deviceIds', unique).catch(this.error);
      if (typeof device.reloadConfiguration === 'function') {
        await device.reloadConfiguration().catch(err => this.error(`reloadConfiguration error: ${err.message}`));
      }
      return true;
    });
  }

}

module.exports = SwitchSyncDriver;
