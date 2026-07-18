# TODO - gpm.linked.switches

Updated: 2026-07-17

---

## ⚠️ Medium Priority

### 3. "Copy errors only" button on the settings page

Today the copy button exports everything. Add an option to copy only entries with `hasError: true`.

File: `drivers/switch-sync/settings/index.html`

### 4. Operational strings for locales

Move user-facing strings from `device.js` to `locales/*.json`:
- `"Virtual Switch"` (trigger name in the log)
- `"Health Check"` (trigger name in the log)
- Push notification text

---

## 🟡 Low Priority

### 5. Switch Master: name, icon, and UX refinements

First version of the `switch-master` driver created. Intended usage as a scene switch:

- One device is chosen as `Master`.
- When the Master turns on, all controlled items turn on.
- When the Master turns off, all controlled items turn off.
- When items are toggled individually:
  - all ON -> Master turns ON
  - all OFF -> Master turns OFF
  - partial state -> Master does not change

This solves the use case of using an auxiliary switch as a scene without losing flexibility: turning everything on through the Master and then turning off 1 or 2 lights individually does not force the group to correct itself.

UI decision:

- `LinkSwitch` prioritizes subdevice status to show desync.
- `SwitchMaster` prioritizes the clickable view of slaves.
- Subdevice status on `SwitchMaster` is controlled by `show_master_status` and is off by default.

Before publishing:
- test on Homey with real devices
- confirm the `Switch Master` name
- define a dedicated icon
- evaluate whether the clickable panel is clear in the UI
- improve pairing text and translate to all supported languages

### 6. Document boot sync in the README

Current rule: if any device is ON on boot, the virtual state becomes ON and the app propagates to divergent devices.

Future options to consider: `any on wins` / `keep virtual state` / `do not auto-align`.

### 7. Switch Inverse

Consider a third device type for two switches in inverse mode:

- limited to 2 devices
- when one turns on, the other turns off
- when one turns off, the other turns on, if that makes sense for the real use case
- useful for scenarios where two states must be mutually exclusive

Before implementing:
- define the final mode/driver name
- choose a dedicated icon
- validate whether the behavior should always be bidirectional or if it needs a master

---

## ❌ Discarded (does not apply)

- **ESLint** — AI workflow + `node --check` + `homey app validate` already cover syntax and real errors; ESLint would only add style checks, with little value for an app this size
- **`light`/`socket` class for the group ("Plugged In → Light")** — the switch tied to the lamp already appears as a light in Homey (only the auxiliaries are hidden); if the virtual group also became a light, the zone counter ("N lights on") would double. The group is a control, not a light — `class: other` is the correct choice

- **Majority vote** — last-write-wins is more predictable for home automation
- **Priority/master device** — adds complexity without solving the real problem
- **`_setDeviceSilently` as a new concept** — `_setDeviceValue` already has suppress, it is the same thing
- **`_isResyncing` flag** — redundant with the existing `_suppress`
- **`pending/late/failed` state machine** — thresholds conflict with the verify timer; discarded until there is a real use case
- **Additional flow cards** (desync_failed, auto_heal_executed) — the 6 implemented cards already cover the real cases
- **Aggregated stats (avg, p95)** — no dashboard to consume them, so no practical value
- **Log compaction** — the 200-entry ring buffer already limits size adequately
