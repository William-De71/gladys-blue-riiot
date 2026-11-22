import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readPools,
  readPoolDevices,
  readDevice,
  readMeasurements,
  readFeed,
  levelOf,
  waterQuality,
} from '../src/read.js';
import { rawMeasures, rawDevice, NOW, HOUR, POOL_ID } from './helpers/fixtures.js';

test('pools and their Blue devices; unusable ids left out, duplicates once', () => {
  assert.deepEqual(
    readPools({
      data: [
        { swimming_pool_id: POOL_ID, name: 'Old', swimming_pool: { name: 'Garden' } },
        { swimming_pool_id: POOL_ID, name: 'Twice' },
        { swimming_pool_id: 'not/an id' },
        { name: 'no id' },
      ],
    }),
    [{ id: POOL_ID, name: 'Garden' }],
  );
  assert.deepEqual(readPools(null), []);
  assert.deepEqual(
    readPoolDevices({
      data: [
        { blue_device_serial: '0A1B2C3D' },
        { blue_device_serial: '0A1B2C3D' },
        { blue_device: { serial: '0E1F' } },
        {},
      ],
    }),
    ['0A1B2C3D', '0E1F'],
  );
});

test('a Blue device: product, firmware, battery, last message of any channel', () => {
  const device = readDevice(rawDevice({ batteryLow: true }));
  assert.equal(device.productName, 'Blue Connect Go');
  assert.equal(device.firmware, '2.3.0');
  assert.equal(device.batteryLow, true);
  assert.equal(device.lastSeen, NOW - HOUR);
  assert.deepEqual(readDevice(undefined), {
    productName: null,
    productType: null,
    firmware: null,
    batteryLow: null,
    lastSeen: null,
  });
});

test('levels against the ranges of Blue Riiot', () => {
  const ph = { okMin: 7.2, okMax: 7.6, warningLow: 6.6, warningHigh: 8.4 };
  assert.equal(levelOf(7.4, ph), 'ok');
  assert.equal(levelOf(7.6, ph), 'ok', 'bounds included');
  assert.equal(levelOf(7.9, ph), 'warning');
  assert.equal(levelOf(6.5, ph), 'critical');
  assert.equal(levelOf(9, { okMin: 7, okMax: 8, warningLow: null, warningHigh: null }), 'warning');
  assert.equal(levelOf(9, { okMin: null, okMax: null, warningLow: 1, warningHigh: 2 }), null);
});

test('the best value per name: the device over an expired strip', () => {
  const { measuredAt, values } = readMeasurements(rawMeasures({ salinity: 3.2 }));
  assert.equal(measuredAt, NOW - HOUR);
  assert.equal(values.ph.value, 7.418);
  assert.equal(values.ph.issuer, 'sigfox');
  assert.equal(values.ph.level, 'ok');
  assert.equal(values.ta.value, 90, 'a strip value stays when it is the only one');
  assert.equal(values.salinity.value, 3.2);
  assert.equal(values.temperature.trend, 'stable');
  // A fresh strip still loses against a fresh device value.
  const both = readMeasurements({
    data: [
      { name: 'ph', value: 7.1, issuer: 'strip', timestamp: new Date(NOW).toISOString() },
      { name: 'ph', value: 7.4, issuer: 'ble', timestamp: new Date(NOW - HOUR).toISOString() },
    ],
  });
  assert.equal(both.values.ph.value, 7.4);
  assert.equal(both.measuredAt, NOW - HOUR, 'the device time, never the strip time');
});

test('salt in ppm becomes a salinity in g/L; values never invented', () => {
  const { values } = readMeasurements({
    data: [{ name: 'salt', value: 3200, ok_min: 2700, ok_max: 3400, issuer: 'sigfox' }],
  });
  assert.equal(values.salinity.value, 3.2);
  assert.equal(values.salinity.okMax, 3.4);
  assert.equal(values.salinity.level, 'ok');
  const empty = readMeasurements({ data: [{ name: 'ph' }, { value: 3 }, null] });
  assert.deepEqual(empty, { measuredAt: null, values: {} });
});

test('the advice: first item of the feed', () => {
  assert.deepEqual(
    readFeed({
      data: [{ id: 'SWP_OK', title: 'Enjoy!', message: 'Water quality is at the top!' }],
    }),
    { id: 'SWP_OK', title: 'Enjoy!', message: 'Water quality is at the top!' },
  );
  assert.equal(readFeed({ data: [] }), null);
  assert.equal(readFeed({ data: [{ title: 'Hi' }] }).id, 'Hi');
});

test('water quality: the worst of pH, redox and salinity, device values only', () => {
  const { values } = readMeasurements(rawMeasures({ ph: 7.9, orp: 300, temperature: 12 }));
  assert.equal(waterQuality(values), 'critical');
  assert.equal(waterQuality(readMeasurements(rawMeasures({ temperature: 12 })).values), 'ok');
  assert.equal(waterQuality({ ph: { level: 'critical', issuer: 'strip' } }), null);
  assert.equal(waterQuality({}), null);
});
