// -----------------------------------------------------------------------------
// Device snapshots -> scene trigger transitions (pure logic, no I/O).
//
// One event per transition, never a periodic snapshot:
//   - new_measure        the Blue Connect sent a measure newer than the last one;
//   - out_of_range       a measure (temperature, pH, redox, salinity) leaves its
//                        ideal range, or goes from warning to critical: the
//                        ranges are the ones Blue Riiot sends with each value;
//   - back_in_range      a measure comes back into its ideal range;
//   - new_advice         the Blue Connect app gives another advice;
//   - battery_low        the battery of the Blue Connect turns low;
//   - measures_stopped   no new measure for STALE_HOURS (fired once, again
//                        only after measures came back).
//
// A device seen for the first time (start, restart, another account) is a
// baseline: nothing that happened before is replayed. Test strips and expired
// values never fire a range event: only what the device measured.
// -----------------------------------------------------------------------------

import { LEVELS, LEVEL_RANK } from './read.js';

const SCENE_TRIGGERS = {
  NEW_MEASURE: 'new_measure',
  OUT_OF_RANGE: 'out_of_range',
  BACK_IN_RANGE: 'back_in_range',
  NEW_ADVICE: 'new_advice',
  BATTERY_LOW: 'battery_low',
  MEASURES_STOPPED: 'measures_stopped',
};

// A Blue Connect Go without a Blue Extender only sends its measures when a
// phone with the app is nearby: a day without a measure is common, two are not.
const STALE_HOURS = 48;
const HOUR = 3600000;
const RANGE_MEASURES = ['temperature', 'ph', 'orp', 'salinity'];

/**
 * @description Whether the measures of a device stopped coming.
 * @param {object} device - `{ measuredAt }`.
 * @param {number} now - Now, in ms.
 * @returns {boolean} True when the latest measure is older than STALE_HOURS.
 * @example
 * isStale({ measuredAt: Date.now() - 49 * 3600000 }, Date.now()); // -> true
 */
function isStale(device, now) {
  return typeof device.measuredAt === 'number' && now - device.measuredAt > STALE_HOURS * HOUR;
}

/**
 * @description The level of a measure of the device itself.
 * @param {object} device - The snapshot.
 * @param {string} name - The measure.
 * @returns {string|null} ok, warning, critical or null.
 */
function levelIn(device, name) {
  const measure = device.values?.[name];
  if (!measure || measure.expired || measure.issuer === 'strip') {
    return null;
  }
  return measure.level in LEVEL_RANK ? measure.level : null;
}

/**
 * @description The transitions between two snapshots of a device.
 * @param {object|undefined} previous - The previous snapshot, undefined the first time.
 * @param {object} next - The new snapshot (`{ measuredAt, values, advice,
 * batteryLow, stale }`).
 * @returns {Array<object>} `{ key, measure?, level?, previous? }` events.
 * @example
 * diffDevice(before, after); // -> [{ key: 'new_measure' }]
 */
function diffDevice(previous, next) {
  if (!previous) {
    return [];
  }
  const events = [];
  if (
    typeof next.measuredAt === 'number' &&
    (typeof previous.measuredAt !== 'number' || next.measuredAt > previous.measuredAt)
  ) {
    events.push({ key: SCENE_TRIGGERS.NEW_MEASURE });
  }
  for (const name of RANGE_MEASURES) {
    const before = levelIn(previous, name);
    const after = levelIn(next, name);
    if (!before || !after || before === after) {
      continue;
    }
    if (after === LEVELS.OK) {
      events.push({ key: SCENE_TRIGGERS.BACK_IN_RANGE, measure: name, previous: before });
    } else if (LEVEL_RANK[after] > LEVEL_RANK[before]) {
      events.push({
        key: SCENE_TRIGGERS.OUT_OF_RANGE,
        measure: name,
        level: after,
        previous: before,
      });
    }
  }
  if (previous.advice?.id && next.advice?.id && previous.advice.id !== next.advice.id) {
    events.push({ key: SCENE_TRIGGERS.NEW_ADVICE, previous: previous.advice.id });
  }
  if (previous.batteryLow === false && next.batteryLow === true) {
    events.push({ key: SCENE_TRIGGERS.BATTERY_LOW });
  }
  if (next.stale && !previous.stale) {
    events.push({ key: SCENE_TRIGGERS.MEASURES_STOPPED });
  }
  return events;
}

export { SCENE_TRIGGERS, STALE_HOURS, RANGE_MEASURES, isStale, levelIn, diffDevice };
