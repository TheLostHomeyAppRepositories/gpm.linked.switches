'use strict';

const { Device } = require('homey');

const MIN_SLAVES = 2;
const MAX_SLAVES = 9;

class SwitchMasterDevice extends Device {

  async onInit() {
    this.log(`[${this.getName()}] Switch Master initialized`);

    this._master = null;
    this._slaves = new Map();
    this._deviceNames = new Map();
    this._suppress = new Map();
    this._registeredControlCaps = new Set();
    this._settingVirtualMaster = false;
    this._syncingMasterFromUnanimity = false;

    this.registerCapabilityListener('onoff', this._onVirtualMasterChanged.bind(this));
    await this._subscribeToDevices();
  }

  async reloadConfiguration() {
    this.log(`[${this.getName()}] Reloading switch master configuration...`);
    await this._subscribeToDevices();
  }

  async _api() {
    return this.homey.app.getHomeyAPI();
  }

  async _subscribeToDevices() {
    if (this._master && this._master.onoffInstance) {
      try { this._master.onoffInstance.destroy(); } catch (_) {}
    }
    for (const { onoffInstance } of this._slaves.values()) {
      try { onoffInstance.destroy(); } catch (_) {}
    }

    this._master = null;
    this._slaves.clear();
    this._deviceNames.clear();
    this._suppress.clear();

    const masterDeviceId = this.getStoreValue('masterDeviceId');
    const slaveIds = this.getStoreValue('deviceIds') || [];
    const api = await this._api();
    let missingCount = 0;

    if (masterDeviceId) {
      try {
        const device = await api.devices.getDevice({ id: masterDeviceId });
        const name = device.name;
        this._deviceNames.set(masterDeviceId, name);
        const onoffInstance = device.makeCapabilityInstance('onoff', value => {
          this._onPhysicalMasterChanged(value)
            .catch(err => this.error(`[${this.getName()}] Physical master update error from "${name}": ${err.message}`));
        });
        this._master = { deviceId: masterDeviceId, device, onoffInstance };
        this.log(`[${this.getName()}] Master: "${name}"`);
      } catch (err) {
        this.error(`[${this.getName()}] Could not subscribe master "${masterDeviceId}": ${err.message}`);
        missingCount++;
      }
    }

    for (const deviceId of slaveIds) {
      try {
        const device = await api.devices.getDevice({ id: deviceId });
        const name = device.name;
        this._deviceNames.set(deviceId, name);

        const onoffInstance = device.makeCapabilityInstance('onoff', value => {
          this._onSlaveChanged(deviceId, name, value)
            .catch(err => this.error(`[${this.getName()}] Slave update error from "${name}": ${err.message}`));
        });

        this._slaves.set(deviceId, { device, onoffInstance });
        this.log(`[${this.getName()}] Slave: "${name}"`);
      } catch (err) {
        this.error(`[${this.getName()}] Could not subscribe slave "${deviceId}": ${err.message}`);
        missingCount++;
      }
    }

    if (missingCount > 0) {
      await this.setUnavailable(`${missingCount} ${this.homey.__('error.missing_devices')}`).catch(() => {});
    } else if (!this._master) {
      await this.setUnavailable(this.homey.__('master_wizard.err_master_required')).catch(() => {});
    } else if (this._slaves.size < MIN_SLAVES) {
      await this.setUnavailable(this.homey.__('master_wizard.err_min2')).catch(() => {});
    } else if (this._slaves.size > MAX_SLAVES) {
      await this.setUnavailable(this.homey.__('master_wizard.err_max9')).catch(() => {});
    } else {
      await this.setAvailable().catch(() => {});
    }

    await this._syncControlCapabilities(masterDeviceId, slaveIds);
    await this._syncStatusCapabilities(masterDeviceId, slaveIds);
    await this._updateLinkedDevicesSetting();
    await this._setVirtualMasterValue(this._getPhysicalMasterValue());
    await this._syncMasterFromUnanimity();
  }

  async _syncControlCapabilities(masterDeviceId, slaveIds) {
    const controlIds = masterDeviceId ? [masterDeviceId, ...slaveIds] : slaveIds;
    const needed = new Set(controlIds.map((_, i) => this._controlCapId(i)));

    for (const cap of this.getCapabilities()) {
      const isOldOnoffSlave = cap.startsWith('onoff.slave_');
      const isOldMasterSlave = cap.startsWith('master_slave.');
      const isOldGang = cap.startsWith('onoff.gang');
      const isOldCustomControl = cap.startsWith('master_switch.');
      const isStaleButton = cap.startsWith('master_button.') && !needed.has(cap);
      if (isOldOnoffSlave || isOldMasterSlave || isOldGang || isOldCustomControl || isStaleButton) await this.removeCapability(cap).catch(() => {});
    }

    await this.setCapabilityOptions('onoff', {
      title: { en: this._master ? `Master: ${this._master.device.name}` : 'Master Switch' },
    }).catch(() => {});

    for (let i = 0; i < controlIds.length; i++) {
      const deviceId = controlIds[i];
      const capId = this._controlCapId(i);
      try {
        if (!this.hasCapability(capId)) await this.addCapability(capId);
        const isMaster = i === 0 && this._master && this._master.deviceId === deviceId;
        const name = this._deviceNames.get(deviceId) || deviceId;
        const icon = isMaster ? '/drivers/switch-master/assets/icon-masterswitch.svg' : '/drivers/switch-master/assets/icon.svg';
        await this.setCapabilityOptions(capId, {
          title: { en: isMaster ? `MASTER: ${name}` : name },
          ...(isMaster ? { icon } : {}),
        });
        await this._setControlCapValue(capId, isMaster ? this._getPhysicalMasterValue() : this._getSlaveValue(deviceId));
        this._registerControlCapability(capId);
      } catch (err) {
        this.error(`[${this.getName()}] Could not set up ${capId}: ${err.message}`);
      }
    }
  }

  async _syncStatusCapabilities(masterDeviceId, slaveIds) {
    const statusIds = masterDeviceId ? [masterDeviceId, ...slaveIds] : slaveIds;
    const showStatus = this._shouldShowDeviceStatus();
    const needed = new Set(showStatus ? statusIds.map((_, i) => this._statusCapId(i)) : []);

    for (const cap of this.getCapabilities()) {
      const isStaleStatus = (cap.startsWith('subdevice_switch.') || cap.startsWith('linked_switch.')) && !needed.has(cap);
      if (isStaleStatus) await this.removeCapability(cap).catch(() => {});
    }

    if (!showStatus) return;

    for (let i = 0; i < statusIds.length; i++) {
      const capId = this._statusCapId(i);
      try {
        if (!this.hasCapability(capId)) await this.addCapability(capId);
        await this._renderStatusCapability(i, statusIds[i]);
      } catch (err) {
        this.error(`[${this.getName()}] Could not set up ${capId}: ${err.message}`);
      }
    }
  }

  _shouldShowDeviceStatus() {
    const value = this.homey.settings.get('show_master_status');
    if (value === undefined || value === null) return false;
    return value !== false && value !== 'false' && value !== 0 && value !== '0';
  }

  async _refreshStatusCapabilities() {
    await this._syncStatusCapabilities(this.getStoreValue('masterDeviceId'), this.getStoreValue('deviceIds') || []);
  }

  _statusCapId(index) {
    return `subdevice_switch.${index + 1}`;
  }

  async _renderStatusCapability(index, deviceId) {
    const capId = this._statusCapId(index);
    if (!this.hasCapability(capId)) return;

    const isMaster = index === 0 && this._master && this._master.deviceId === deviceId;
    const name = this._deviceNames.get(deviceId) || deviceId;
    const title = isMaster ? `MASTER: ${name}` : name;
    const icon = isMaster ? '/drivers/switch-master/assets/icon-masterswitch.svg' : '/drivers/switch-master/assets/icon.svg';

    await this.setCapabilityOptions(capId, {
      title: { en: title },
      ...(isMaster ? { icon } : {}),
    });
    await this.setCapabilityValue(capId, this._statusCapText(deviceId));
  }

  _statusCapText(deviceId) {
    if (this._master && this._master.deviceId === deviceId) {
      return this._statusText(this._getPhysicalMasterValue());
    }
    return this._statusText(this._getSlaveValue(deviceId));
  }

  async _updateStatusCapability(deviceId) {
    if (!this._shouldShowDeviceStatus()) return;

    const ids = this._master ? [this._master.deviceId, ...(this.getStoreValue('deviceIds') || [])] : (this.getStoreValue('deviceIds') || []);
    const index = ids.indexOf(deviceId);
    if (index === -1) return;

    const capId = this._statusCapId(index);
    if (!this.hasCapability(capId)) return;
    await this.setCapabilityValue(capId, this._statusCapText(deviceId)).catch(() => {});
  }

  _controlCapId(index) {
    return `master_button.${index + 1}`;
  }

  _registerControlCapability(capId) {
    if (this._registeredControlCaps.has(capId)) return;
    this._registeredControlCaps.add(capId);

    this.registerCapabilityListener(capId, async (value) => {
      const ids = this._master ? [this._master.deviceId, ...(this.getStoreValue('deviceIds') || [])] : (this.getStoreValue('deviceIds') || []);
      const index = Number(capId.replace('master_button.', '')) - 1;
      const deviceId = ids[index];
      if (!deviceId) return;
      if (this._master && deviceId === this._master.deviceId) {
        await this._onVirtualMasterChanged(value);
      } else {
        await this._setOneSlave(deviceId, value, 'master button');
      }
    });
  }

  _getPhysicalMasterValue() {
    return this._master ? this._master.onoffInstance.value : null;
  }

  _getSlaveValue(deviceId) {
    const entry = this._slaves.get(deviceId);
    return entry ? entry.onoffInstance.value : null;
  }

  _statusText(value) {
    if (value === true) return 'On';
    if (value === false) return 'Off';
    return '—';
  }

  async _setVirtualMasterValue(value) {
    if (typeof value !== 'boolean') return;
    if (this.getCapabilityValue('onoff') === value) return;

    this._settingVirtualMaster = true;
    try {
      await this.setCapabilityValue('onoff', value);
    } finally {
      this._settingVirtualMaster = false;
    }
  }

  async _setControlCapValue(capId, value) {
    if (!this.hasCapability(capId)) return;
    if (typeof value !== 'boolean') return;
    if (this.getCapabilityValue(capId) === value) return;
    await this.setCapabilityValue(capId, value);
  }

  async _updateControlValue(deviceId) {
    const ids = this._master ? [this._master.deviceId, ...(this.getStoreValue('deviceIds') || [])] : (this.getStoreValue('deviceIds') || []);
    const index = ids.indexOf(deviceId);
    if (index === -1) return;
    const value = this._master && deviceId === this._master.deviceId ? this._getPhysicalMasterValue() : this._getSlaveValue(deviceId);
    await this._setControlCapValue(this._controlCapId(index), value);
  }

  async _onVirtualMasterChanged(value) {
    if (this._settingVirtualMaster) return;
    this.log(`[${this.getName()}] Virtual master -> ${value ? 'ON' : 'OFF'}`);
    await this._setVirtualMasterValue(value);
    if (this._master) await this._setControlCapValue(this._controlCapId(0), value).catch(() => {});
    if (this._master) await this._updateStatusCapability(this._master.deviceId).catch(() => {});
    await this._setPhysicalMaster(value, 'virtual master');
    await this._setAllSlaves(value, 'virtual master');
  }

  async _onPhysicalMasterChanged(value) {
    const masterName = this._master ? this._master.device.name : 'master';
    await this._setVirtualMasterValue(value);
    if (this._master) await this._updateControlValue(this._master.deviceId);
    if (this._master) await this._updateStatusCapability(this._master.deviceId);

    if (this._master && this._isSuppressed(this._master.deviceId, value)) return;

    this.log(`[${this.getName()}] Physical master "${masterName}" -> ${value ? 'ON' : 'OFF'}`);
    await this._setAllSlaves(value, 'physical master');
  }

  async _onSlaveChanged(deviceId, name, value) {
    if (this._isSuppressed(deviceId, value)) return;

    const index = (this.getStoreValue('deviceIds') || []).indexOf(deviceId);
    if (index !== -1) {
      await this._updateControlValue(deviceId).catch(err => {
        this.error(`[${this.getName()}] Could not update slave button "${name}": ${err.message}`);
      });
    }
    await this._updateStatusCapability(deviceId);

    await this._syncMasterFromUnanimity();
  }

  async _setPhysicalMaster(value, source) {
    if (!this._master || !this._master.device.available) return;

    const suppressMs = this.getSetting('suppress_ms') || 2000;
    this._suppressDevice(this._master.deviceId, value, suppressMs);

    try {
      await this._master.device.setCapabilityValue({ capabilityId: 'onoff', value });
      this.log(`[${this.getName()}] ${source}: master "${this._master.device.name}" -> ${value ? 'ON' : 'OFF'}`);
    } catch (err) {
      this.error(`[${this.getName()}] Failed to set master "${this._master.device.name}": ${err.message}`);
    }
  }

  async _setAllSlaves(value, source) {
    const slaveIds = this.getStoreValue('deviceIds') || [];
    const suppressMs = this.getSetting('suppress_ms') || 2000;

    this.log(`[${this.getName()}] ${source}: setting ${slaveIds.length} slave(s) to ${value ? 'ON' : 'OFF'}`);

    const tasks = slaveIds.map(async (deviceId, index) => {
      const entry = this._slaves.get(deviceId);
      if (!entry) {
        this.error(`[${this.getName()}] ${source}: slave ${deviceId} is not subscribed`);
        return;
      }
      if (!entry.device.available) {
        this.error(`[${this.getName()}] ${source}: slave "${entry.device.name}" is unavailable`);
        return;
      }

      this._suppressDevice(deviceId, value, suppressMs);
      await this._setControlCapValue(this._controlCapId(index + 1), value).catch(() => {});
      await this._updateStatusCapability(deviceId).catch(() => {});

      try {
        await entry.device.setCapabilityValue({ capabilityId: 'onoff', value });
        this.log(`[${this.getName()}] ${source}: slave "${entry.device.name}" -> ${value ? 'ON' : 'OFF'}`);
      } catch (err) {
        this.error(`[${this.getName()}] Failed to set slave "${entry.device.name}": ${err.message}`);
      }
    });

    await Promise.allSettled(tasks);
  }

  async _setOneSlave(deviceId, value, source) {
    const entry = this._slaves.get(deviceId);
    if (!entry || !entry.device.available) return;

    const suppressMs = this.getSetting('suppress_ms') || 2000;
    this.log(`[${this.getName()}] ${source}: slave "${entry.device.name}" -> ${value ? 'ON' : 'OFF'}`);

    this._suppressDevice(deviceId, value, suppressMs);
    const index = (this.getStoreValue('deviceIds') || []).indexOf(deviceId);
    if (index !== -1) await this._setControlCapValue(this._controlCapId(index + 1), value).catch(() => {});
    await this._updateStatusCapability(deviceId).catch(() => {});
    try {
      await entry.device.setCapabilityValue({ capabilityId: 'onoff', value });
    } catch (err) {
      this.error(`[${this.getName()}] Failed to set slave "${entry.device.name}": ${err.message}`);
    }

    await this._syncMasterFromUnanimity();
  }

  async _syncMasterFromUnanimity() {
    if (this._syncingMasterFromUnanimity) return;

    const values = [...this._slaves.values()]
      .map(({ onoffInstance }) => onoffInstance.value)
      .filter(value => typeof value === 'boolean');

    if (values.length < MIN_SLAVES) return;

    const allOn = values.every(Boolean);
    const allOff = values.every(value => value === false);
    if (!allOn && !allOff) return;

    const target = allOn;
    if (this._getPhysicalMasterValue() === target && this.getCapabilityValue('onoff') === target) return;

    this._syncingMasterFromUnanimity = true;
    try {
      this.log(`[${this.getName()}] Slave unanimity -> master ${target ? 'ON' : 'OFF'}`);
      await this._setVirtualMasterValue(target);
      if (this._master) await this._setControlCapValue(this._controlCapId(0), target).catch(() => {});
      await this._setPhysicalMaster(target, 'slave unanimity');
      if (this._master) await this._updateStatusCapability(this._master.deviceId);
    } finally {
      this._syncingMasterFromUnanimity = false;
    }
  }

  _suppressDevice(deviceId, value, suppressMs) {
    const old = this._suppress.get(deviceId);
    if (old && old.timer) this.homey.clearTimeout(old.timer);

    const timer = this.homey.setTimeout(() => {
      this._suppress.delete(deviceId);
    }, suppressMs);

    this._suppress.set(deviceId, { value, timer });
  }

  _isSuppressed(deviceId, value) {
    const entry = this._suppress.get(deviceId);
    return Boolean(entry && entry.value === value);
  }

  async _updateLinkedDevicesSetting() {
    try {
      const masterName = this._master ? this._master.device.name : 'None';
      const slaveNames = Array.from(this._slaves.values()).map(({ device }) => device.name).join('\n') || 'None';
      await this.setSettings({ linked_devices_info: `Master: ${masterName}\n\nSlaves:\n${slaveNames}` });
    } catch (err) {
      this.error(`[${this.getName()}] Failed to update settings: ${err.message}`);
    }
  }

  async onDeleted() {
    if (this._master && this._master.onoffInstance) {
      try { this._master.onoffInstance.destroy(); } catch (_) {}
    }
    for (const { onoffInstance } of this._slaves.values()) {
      try { onoffInstance.destroy(); } catch (_) {}
    }
    for (const { timer } of this._suppress.values()) {
      if (timer) this.homey.clearTimeout(timer);
    }
  }

}

module.exports = SwitchMasterDevice;
