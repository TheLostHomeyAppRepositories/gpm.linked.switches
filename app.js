'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');

module.exports = class SwitchSyncApp extends Homey.App {

  async onInit() {
    this.log('Switch Sync app initialized');
    this._homeyAPI     = null;
    this._syncLog      = null;
    this._syncLogTimer = null;

    if (this.homey.settings.get('show_device_status') === undefined) {
      this.homey.settings.set('show_device_status', true);
    }

    this.homey.settings.on('set', (key) => {
      if (key === 'desyncLog') {
        const val = this.homey.settings.get('desyncLog');
        if (Array.isArray(val) && val.length === 0) {
          this.log('Log cleared from settings page');
          if (this._syncLogTimer) {
            this.homey.clearTimeout(this._syncLogTimer);
            this._syncLogTimer = null;
          }
          this._syncLog = [];
        }
      }

      if (key === 'show_device_status') {
        this._renderAllGroupCards().catch(err => this.error(`Failed to refresh group cards: ${err.message}`));
      }
    });
  }

  async getHomeyAPI() {
    if (!this._homeyAPI) {
      this._homeyAPI = await HomeyAPI.createAppAPI({ homey: this.homey });
    }
    return this._homeyAPI;
  }

  addSyncReport(report) {
    // Suppress writes for 3s after a manual clear (health check race)
    if (this._clearTs && Date.now() - this._clearTs < 3000) return;

    // Respect log mode — skip successful syncs when mode is 'errors' (default),
    // but always keep `important` events (e.g. a recovery that closes a prior failure)
    const logMode = this.homey.settings.get('log_mode') || 'errors';
    if (!report.hasError && !report.important && logMode !== 'full') return;

    const summary = this._formatSyncReport(report);
    if (summary) {
      if (report.hasError) this.error(summary);
      else if (report.important || logMode === 'full') this.log(summary);
    }

    if (!this._syncLog) {
      this._syncLog = this.homey.settings.get('desyncLog') || [];
    }
    this._syncLog.unshift(report);
    if (this._syncLog.length > 200) this._syncLog.length = 200;

    if (report.hasError) {
      // Write immediately for errors — never lose a failure event
      if (this._syncLogTimer) {
        this.homey.clearTimeout(this._syncLogTimer);
        this._syncLogTimer = null;
      }
      this.homey.settings.set('desyncLog', this._syncLog);
    } else {
      // Debounce flash writes for successful syncs — max once per minute
      if (this._syncLogTimer) return;
      this._syncLogTimer = this.homey.setTimeout(() => {
        this._syncLogTimer = null;
        this.homey.settings.set('desyncLog', this._syncLog);
      }, 60000);
    }
  }

  clearSyncLog() {
    if (this._syncLogTimer) {
      this.homey.clearTimeout(this._syncLogTimer);
      this._syncLogTimer = null;
    }
    this._syncLog = [];
    this._clearTs = Date.now();
    this.homey.settings.set('desyncLog', []);
  }

  _formatSyncReport(report) {
    if (!report || !Array.isArray(report.devices) || report.devices.length === 0) return '';
    const target = typeof report.value === 'boolean' ? (report.value ? 'ON' : 'OFF') : '?';

    if (report.hasError) {
      const failed = report.devices
        .filter(device => !device.synced)
        .map(device => {
          const state = `${device.expected ? 'ON' : 'OFF'} expected, ${device.actual ? 'ON' : 'OFF'} actual`;
          return device.errorMessage
            ? `${device.name} (${state}; ${device.errorMessage})`
            : `${device.name} (${state})`;
        });
      return `[Sync failed] ${report.group}: ${report.trigger} -> ${target}; ${failed.join(', ')}`;
    }

    const recovered = report.devices.filter(device => device.recovered);
    if (recovered.length > 0) {
      const names = recovered.map(device => `${device.name} (${Math.round((device.durationMs || 0) / 1000)}s)`);
      return `[Sync recovered] ${report.group}: ${names.join(', ')}`;
    }

    return `[Sync ok] ${report.group}: ${report.trigger} -> ${target}; ${report.devices.length} device(s) verified`;
  }

  async _renderAllGroupCards() {
    const driver = this.homey.drivers.getDriver('switch-sync');
    for (const device of driver.getDevices()) {
      if (typeof device._renderAllSubCapabilities === 'function') {
        await device._renderAllSubCapabilities();
      }
    }
  }

  async onApi(method, path, body) {
    this.log(`onApi called: ${method} "${path}"`);
    const normalPath = path.startsWith('/') ? path : `/${path}`;
    if (method === 'POST' && normalPath === '/clear-log') {
      this.clearSyncLog();
      this.log('onApi: clearSyncLog done');
      return { ok: true };
    }
    throw new Error(`Unknown API: ${method} ${path}`);
  }

  // Returns all devices with onoff capability, excluding our own driver, with zone info
  async getDevicesWithOnOff() {
    const api = await this.getHomeyAPI();
    const [allDevices, allZones] = await Promise.all([
      api.devices.getDevices(),
      api.zones.getZones().catch(() => ({})),
    ]);

    return Object.values(allDevices)
      .filter(d => {
        const caps = d.capabilities || [];
        const isOwn = d.driverId === 'switch-sync' && d.ownerUri === 'homey:app:gpm.linked.switches';
        return caps.includes('onoff') && !isOwn;
      })
      .map(d => {
        const zone = allZones[d.zone] || null;
        return { id: d.id, name: d.name, zoneId: d.zone || null, zoneName: zone ? zone.name : null };
      })
      .sort((a, b) => {
        const za = a.zoneName || '';
        const zb = b.zoneName || '';
        return za.localeCompare(zb) || a.name.localeCompare(b.name);
      });
  }

};
