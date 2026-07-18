# TODO - gpm.linked.switches

Updated: 2026-07-18

---

## ✅ Completed

### Switch Master driver

- Added the `switch-master` driver.
- Implemented master + slave synchronization.
- Added unanimity handling so the master follows the slaves when all slaves match.
- Added a dedicated `show_master_status` app setting.
- Kept `SwitchMaster` status view optional and off by default.

### Linked Switch driver

- Split the status capability into `subdevice_switch`.
- Kept the group sync behavior for `switch-sync`.
- Added the `show_device_status` app setting for Linked Switch cards.

### Documentation and packaging

- Updated `README.md`.
- Updated `README.txt`.
- Added `.homeychangelog.json` for version `1.1.0`.
- Bumped the app version to `1.1.0`.

---

## ⚠️ Medium Priority

### Copy only errors from the settings page

The copy button currently exports everything. Add an option to copy only entries with `hasError: true`.

File: `drivers/switch-sync/settings/index.html`

### Locale strings cleanup

Move remaining user-facing strings from `device.js` to `locales/*.json`:

- `Virtual Switch`
- `Health Check`
- push notification text

---

## 🟡 Low Priority

### Boot sync rule documentation

Document the boot behavior in more detail:

- if any device is ON at boot, the virtual state becomes ON
- the app then propagates that state to divergent devices

Possible future alternatives to consider:

- `any on wins`
- `keep virtual state`
- `do not auto-align`

### Inverse switch driver

Consider a third driver for two switches in inverse mode:

- limited to 2 devices
- when one turns on, the other turns off
- when one turns off, the other turns on, if that matches the real use case
- useful for mutually exclusive states

Before implementing:

- define the final driver name
- choose a dedicated icon
- decide whether the behavior should always be bidirectional or if it needs a master

---

## ❌ Discarded

- **ESLint** - AI workflow + `node --check` + `homey app validate` already cover syntax and real errors; ESLint would only add style checks, with little value for an app this size
- **`light`/`socket` class for the group ("Plugged In → Light")** - the switch tied to the lamp already appears as a light in Homey; if the virtual group also became a light, the zone counter would double. The group is a control, not a light, so `class: other` is correct
- **Majority vote** - last-write-wins is more predictable for home automation
- **Priority/master device** - adds complexity without solving the real problem
- **`_setDeviceSilently` as a new concept** - `_setDeviceValue` already has suppress, so it is the same thing
- **`_isResyncing` flag** - redundant with the existing `_suppress`
- **`pending/late/failed` state machine** - thresholds conflict with the verify timer; discarded until there is a real use case
- **Additional flow cards** (`desync_failed`, `auto_heal_executed`) - the implemented cards already cover the real cases
- **Aggregated stats** (`avg`, `p95`) - no dashboard consumes them, so they have no practical value
- **Log compaction** - the 200-entry ring buffer already limits size adequately
