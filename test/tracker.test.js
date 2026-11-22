import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffDevice, isStale, SCENE_TRIGGERS, STALE_HOURS } from '../src/tracker.js';
import { readMeasurements, readDevice } from '../src/read.js';
import { deviceSnapshot, NOW, HOUR } from './helpers/fixtures.js';

const snapshot = (options = {}, now = NOW) => {
  const device = deviceSnapshot(options, readMeasurements, readDevice);
  return { ...device, stale: isStale(device, now) };
};
const keys = (events) => events.map((event) => event.key);

test('the first snapshot is a baseline: nothing is replayed', () => {
  assert.deepEqual(diffDevice(undefined, snapshot({ measures: { ph: 9 } })), []);
});

test('a newer measure is a new_measure, the same or an older one is nothing', () => {
  const before = snapshot();
  assert.deepEqual(diffDevice(before, snapshot()), []);
  assert.deepEqual(keys(diffDevice(before, snapshot({ measures: { at: NOW } }))), [
    SCENE_TRIGGERS.NEW_MEASURE,
  ]);
  assert.deepEqual(diffDevice(before, snapshot({ measures: { at: NOW - 2 * HOUR } })), []);
});

test('out of range and back in range, per measure, only when it gets worse', () => {
  const ok = snapshot();
  const warning = snapshot({ measures: { ph: 7.9 } });
  const critical = snapshot({ measures: { ph: 8.6 } });
  assert.deepEqual(diffDevice(ok, warning), [
    { key: 'out_of_range', measure: 'ph', level: 'warning', previous: 'ok' },
  ]);
  assert.deepEqual(diffDevice(warning, critical), [
    { key: 'out_of_range', measure: 'ph', level: 'critical', previous: 'warning' },
  ]);
  assert.deepEqual(diffDevice(critical, warning), [], 'better but still out: nothing');
  assert.deepEqual(diffDevice(warning, ok), [
    { key: 'back_in_range', measure: 'ph', previous: 'warning' },
  ]);
  const cold = snapshot({ measures: { temperature: 12, orp: 500, salinity: 3 } });
  const before = snapshot({ measures: { salinity: 3 } });
  assert.deepEqual(
    diffDevice(before, cold).map((event) => event.measure),
    ['temperature', 'orp'],
  );
});

test('strips and expired values never fire a range event', () => {
  const before = snapshot();
  const after = snapshot();
  after.values.ph = { ...after.values.ph, value: 9, level: 'critical', expired: true };
  assert.deepEqual(diffDevice(before, after), []);
});

test('new advice, battery low, measures stopped once', () => {
  const before = snapshot();
  assert.deepEqual(
    diffDevice(before, snapshot({ advice: { id: 'SWP_PH_HIGH', title: 'pH', message: '' } })),
    [{ key: 'new_advice', previous: 'SWP_OK' }],
  );
  assert.deepEqual(
    diffDevice(before, snapshot({ advice: { id: 'SWP_OK', title: 'Profitez !', message: '' } })),
    [],
    'the same advice in another language is not new',
  );
  assert.deepEqual(keys(diffDevice(before, snapshot({ device: { batteryLow: true } }))), [
    'battery_low',
  ]);
  const later = NOW + STALE_HOURS * HOUR;
  const stale = snapshot({}, later);
  assert.equal(stale.stale, true);
  assert.deepEqual(keys(diffDevice(before, stale)), ['measures_stopped']);
  assert.deepEqual(diffDevice(stale, snapshot({}, later)), [], 'fired once');
  assert.equal(isStale({ measuredAt: null }, NOW), false);
});
