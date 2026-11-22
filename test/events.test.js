import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDeviceEvent, buildDeviceOutputs } from '../src/events.js';
import { SCENE_TRIGGERS } from '../src/tracker.js';
import { readMeasurements, readDevice } from '../src/read.js';
import { fakeGladys, deviceSnapshot, NOW, HOUR, SERIAL } from './helpers/fixtures.js';

const snapshot = (options) => deviceSnapshot(options, readMeasurements, readDevice);
const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const DEVICE = `ext:blue-riiot:blue:${SERIAL}`;

/**
 * @description Check a payload against the limits of the core and the manifest.
 * @param {string} key - The trigger.
 * @param {object} data - The payload.
 */
function checkPayload(key, data) {
  const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
  assert.ok(trigger, key);
  assert.ok(Object.keys(data).length <= 30);
  const declared = new Set([...trigger.variables.map((v) => v.key), 'device', 'device_name']);
  for (const [name, value] of Object.entries(data)) {
    assert.ok(declared.has(name) || trigger.fields.some((f) => f.key === name), `${key}.${name}`);
    assert.ok(
      value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 1000),
      `${key}.${name}`,
    );
  }
  for (const field of trigger.fields) {
    assert.ok(field.key in data, `${key}: the filter ${field.key} has a value to match`);
  }
}

const EVENTS = [
  { key: SCENE_TRIGGERS.NEW_MEASURE },
  { key: SCENE_TRIGGERS.OUT_OF_RANGE, measure: 'ph', level: 'critical', previous: 'ok' },
  { key: SCENE_TRIGGERS.BACK_IN_RANGE, measure: 'ph', previous: 'warning' },
  { key: SCENE_TRIGGERS.NEW_ADVICE, previous: 'SWP_OK' },
  { key: SCENE_TRIGGERS.BATTERY_LOW },
  { key: SCENE_TRIGGERS.MEASURES_STOPPED },
];

test('every event fits the core limits and declares its variables', () => {
  const device = snapshot({ measures: { ph: 8.6, salinity: 3.2 } });
  for (const event of EVENTS) {
    const { key, data } = buildDeviceEvent(fakeGladys, device, event, 'fr', NOW + 50 * HOUR);
    assert.equal(key, event.key);
    assert.equal(data.device, DEVICE);
    assert.equal(data.device_name, 'Blue Connect Go Garden');
    assert.ok(data.summary.length > 0);
    checkPayload(key, data);
  }
  assert.throws(() => buildDeviceEvent(fakeGladys, device, { key: 'nope' }, 'en', NOW));
});

test('summaries ready for a message, in the language of the texts', () => {
  const device = snapshot({ measures: { ph: 8.6, salinity: 3.2 } });
  const measure = buildDeviceEvent(fakeGladys, device, EVENTS[0], 'fr', NOW).data;
  assert.equal(
    measure.summary,
    'Blue Connect Go Garden : eau 26,4 °C, pH 8,6, redox 702 mV, salinité 3,2 g/L.',
  );
  assert.equal(measure.water_quality, 'critical');
  assert.equal(measure.salinity, 3.2);
  const out = buildDeviceEvent(fakeGladys, device, EVENTS[1], 'en', NOW).data;
  assert.equal(
    out.summary,
    'Blue Connect Go Garden: pH 8.6, far outside the ideal range (7.2 to 7.6).',
  );
  assert.deepEqual(
    [out.measure, out.value, out.level, out.ok_min, out.ok_max],
    ['ph', 8.6, 'critical', 7.2, 7.6],
  );
  const advice = buildDeviceEvent(fakeGladys, device, EVENTS[3], 'en', NOW).data;
  assert.equal(advice.summary, 'Blue Connect Go Garden: Enjoy! Water quality is at the top!');
  const stopped = buildDeviceEvent(fakeGladys, device, EVENTS[5], 'de', NOW + 50 * HOUR).data;
  assert.equal(stopped.hours, 51);
  assert.equal(stopped.last_measure_at, new Date(NOW - HOUR).toISOString());
});

test('get_device returns exactly its declared outputs, -1 or empty when unknown', () => {
  const action = manifest.scene_actions.find((entry) => entry.key === 'get_device');
  const types = Object.fromEntries(action.outputs.map((output) => [output.key, output.type]));
  for (const device of [
    snapshot({ measures: { salinity: 3.2 } }),
    snapshot({ measures: { temperature: null, ph: null, orp: null, strips: false }, advice: null }),
  ]) {
    const outputs = buildDeviceOutputs(device, 'es');
    assert.deepEqual(Object.keys(outputs).sort(), Object.keys(types).sort());
    for (const [key, value] of Object.entries(outputs)) {
      assert.equal(typeof value, types[key] === 'number' ? 'number' : types[key], key);
    }
  }
  const empty = buildDeviceOutputs(
    snapshot({ measures: { temperature: null, ph: null, orp: null, strips: false }, advice: null }),
    'fr',
  );
  assert.deepEqual(
    [empty.ph, empty.free_chlorine, empty.water_quality, empty.advice],
    [-1, -1, '', ''],
  );
  assert.match(empty.summary, /pas encore de mesure/);
});
