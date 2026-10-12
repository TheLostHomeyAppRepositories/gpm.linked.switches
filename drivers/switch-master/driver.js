'use strict';

const { Driver } = require('homey');
const { buildOccupiedMap } = require('../../lib/occupiedMap');

const MIN_SLAVES = 2;
const MAX_SLAVES = 9;

class SwitchMasterDriver extends Driver {

  async onInit() {
    this.log('SwitchMasterDriver initialized');
  }

  _validateConfig(config) {
    const masterDeviceId = config && config.masterDeviceId;
    const deviceIds = config && config.deviceIds;

    if (!masterDeviceId) {
      throw new Error(this.homey.__('master_wizard.err_master_required'));
    }
    if (!Array.isArray(deviceIds)) {
      throw new Error(this.homey.__('master_wizard.err_min2'));
    }

    const uniqueSlaves = [...new Set(deviceIds)].filter(id => id !== masterDeviceId);
    if (uniqueSlaves.length < MIN_SLAVES) {
      throw new Error(this.homey.__('master_wizard.err_min2'));
    }
    if (uniqueSlaves.length > MAX_SLAVES) {
      throw new Error(this.homey.__('master_wizard.err_max9'));
    }

    return { masterDeviceId, deviceIds: uniqueSlaves };
  }

  _assertNoConflicts(config, excludeHomeyDeviceId = null) {
    const occupied = buildOccupiedMap(this.homey, excludeHomeyDeviceId);
    const slaveIds = [...new Set(config.deviceIds || [])].filter(id => id !== config.masterDeviceId);
    const masterConflicts = occupied.get(config.masterDeviceId) || [];
    const slaveConflicts = [];
    const linkedFamilies = new Map();

    for (const id of slaveIds) {
      const entries = occupied.get(id) || [];
      const allowedLinkedEntries = entries.filter(entry => entry.driverId === 'switch-sync' && entry.role === 'member');
      const blockedEntries = entries.filter(entry => !(entry.driverId === 'switch-sync' && entry.role === 'member'));

      if (blockedEntries.length > 0) {
        slaveConflicts.push(...blockedEntries.map(entry => entry.name));
      }

      for (const entry of allowedLinkedEntries) {
        const seen = linkedFamilies.get(entry.groupId);
        if (seen && seen !== id) {
          slaveConflicts.push(entry.name);
          continue;
        }
        linkedFamilies.set(entry.groupId, id);
      }
    }

    if (masterConflicts.length === 0 && slaveConflicts.length === 0) return;

    const names = [
      ...new Set([
        ...masterConflicts.map(entry => entry.name),
        ...slaveConflicts,
      ]),
    ];
    throw new Error(
      this.homey.__('master_wizard.err_device_conflict').replace('{names}', names.join('", "'))
    );
  }

  async onPair(session) {
    let pendingConfig = null;

    session.setHandler('get_available_devices', async () => {
      const devices = await this.homey.app.getDevicesWithOnOff();
      this.log(`switch-master get_available_devices: found ${devices.length} devices`);
      return devices;
    });

    session.setHandler('configure_master', async (config) => {
      const validated = this._validateConfig(config);
      this._assertNoConflicts(validated);
      pendingConfig = { name: config.name, ...validated };
      this.log(`switch-master configure_master: master=${validated.masterDeviceId}, slaves=${validated.deviceIds.length}`);
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!pendingConfig) return [];
      this.log(`switch-master list_devices: creating "${pendingConfig.name}"`);
      return [{
        name: pendingConfig.name,
        data: { id: `master_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
        store: {
          masterDeviceId: pendingConfig.masterDeviceId,
          deviceIds: pendingConfig.deviceIds,
        },
        settings: {
          suppress_ms: 2000,
          linked_devices_info: 'Pending master...',
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
        masterDeviceId: device.getStoreValue('masterDeviceId') || null,
        deviceIds: device.getStoreValue('deviceIds') || [],
        deviceNames: device.getStoreValue('deviceNames') || {},
      };
    });

    session.setHandler('save_config', async (config) => {
      const { masterDeviceId, deviceIds } = this._validateConfig(config);
      this._assertNoConflicts({ masterDeviceId, deviceIds }, device.getId());
      await device.setStoreValue('masterDeviceId', masterDeviceId).catch(this.error);
      await device.setStoreValue('deviceIds', deviceIds).catch(this.error);

      await device.reloadConfiguration().catch(err => this.error(`reloadConfiguration error: ${err.message}`));

      return true;
    });
  }

}

module.exports = SwitchMasterDriver;
