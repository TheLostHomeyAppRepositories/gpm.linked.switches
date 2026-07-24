Linked Switches keeps 2 to 10 on/off devices in sync, so any switch or Homey action changes them all together.

You can optionally mark one device as Primary. That device is controlled first, and the rest follow with a small stagger to keep your Zigbee network calm.

Switch Master is for scene-style control: use 1 master and 2 to 9 slave devices. The master can override the slaves, the slaves keep their own control, and the master syncs back when all slaves agree.

Switch Master can include devices that already belong to a Linked Switch group, but only one member per group to avoid redundant commands.

A shared sync log in the app settings helps you diagnose failed writes and offline devices.
