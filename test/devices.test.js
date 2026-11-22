// The device of a Blue Connect, checked against the rules the host API
// applies (and the ones the fake Gladys of the SDK does not check: see the
// community feedback, forum topic 11005).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildDevice,
  buildDeviceStates,
  serialFromExternalId,
  qualityText,
  adviceText,
  DEVICE_FEATURES,
} from '../src/device.js';
import { readMeasurements, readDevice } from '../src/read.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, deviceSnapshot, SERIAL } from './helpers/fixtures.js';

const snapshot = (options) => deviceSnapshot(options, readMeasurements, readDevice);
const DEVICE = `ext:blue-riiot:blue:${SERIAL}`;
const statesOf = (device, language) =>
  Object.fromEntries(
    buildDeviceStates(fakeGladys, device, language).map((s) => [
      s.device_feature_external_id.split(':').pop(),
      s.state ?? s.text,
    ]),
  );

test('one device per Blue Connect, with stable ids and every mandatory field', () => {
  const device = buildDevice(fakeGladys, snapshot({ measures: { salinity: 3.2 } }), 'fr');
  assert.equal(device.name, 'Blue Connect Go Garden');
  assert.equal(device.external_id, DEVICE);
  assert.equal(device.should_poll, false, 'read on the integration timer');
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(
    device.params.map((param) => param.name),
    ['BLUE_SERIAL', 'BLUE_POOL_ID', 'BLUE_FIRMWARE'],
  );
  assert.deepEqual(
    device.features.map((feature) => feature.external_id),
    DEVICE_FEATURES.map((spec) => `${DEVICE}:${spec.key}`),
  );
  const categories = Object.values(CATEGORIES);
  for (const feature of device.features) {
    for (const key of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    assert.ok(Number.isFinite(feature.min) && Number.isFinite(feature.max));
    assert.ok(categories.includes(feature.category), feature.category);
    assert.equal(feature.read_only, true, 'nothing can be set');
    assert.ok(feature.name.length > 0);
  }
  const byKey = Object.fromEntries(device.features.map((f) => [f.external_id.split(':').pop(), f]));
  assert.equal(byKey.ph.type, TYPES.PH_SENSOR.DECIMAL);
  assert.equal(byKey.orp.type, TYPES.ORP_SENSOR.DECIMAL);
  assert.equal(byKey.orp.unit, UNITS.MILLI_VOLT);
  assert.equal(byKey.salinity.unit, UNITS.PPM);
  assert.equal(byKey.water_quality.category, CATEGORIES.TEXT);
  assert.equal(byKey.battery_low.category, CATEGORIES.BATTERY_LOW);
  assert.equal(byKey.battery_low.type, TYPES.BATTERY_LOW.BINARY);
});

test('no salinity feature on a model that does not measure it (nor from a strip)', () => {
  const plain = buildDevice(fakeGladys, snapshot(), 'en');
  assert.ok(!plain.features.some((feature) => feature.external_id.endsWith(':salinity')));
  const strip = snapshot();
  strip.values.salinity = { name: 'salinity', value: 3, issuer: 'strip' };
  assert.ok(
    !buildDevice(fakeGladys, strip, 'en').features.some((f) => f.external_id.endsWith(':salinity')),
  );
});

test('without a product or a pool name: translated defaults; ids never depend on them', () => {
  const unnamed = { ...snapshot(), productName: null, poolName: null };
  assert.equal(buildDevice(fakeGladys, unnamed, 'fr').name, 'Blue Connect piscine');
  assert.equal(buildDevice(fakeGladys, unnamed, 'de').external_id, DEVICE);
});

test('the states, rounded; salinity in ppm; unknown or expired values are not published', () => {
  assert.deepEqual(statesOf(snapshot({ measures: { salinity: 3.214 } }), 'fr'), {
    temperature: 26.4,
    ph: 7.42,
    orp: 702,
    salinity: 3214,
    water_quality: 'Bonne',
    advice: 'Enjoy! Water quality is at the top!',
    battery_low: 0,
  });
  const empty = snapshot({
    measures: { temperature: null, ph: null, orp: null, strips: false },
    advice: null,
  });
  empty.batteryLow = null;
  assert.deepEqual(buildDeviceStates(fakeGladys, empty, 'en'), []);
  const expired = snapshot();
  expired.values.ph = { ...expired.values.ph, expired: true };
  assert.equal(statesOf(expired, 'en').ph, undefined);
  const low = snapshot({ device: { batteryLow: true }, measures: { orp: 300 } });
  assert.deepEqual(
    [statesOf(low, 'de').battery_low, statesOf(low, 'de').water_quality],
    [1, 'Außerhalb des Bereichs'],
  );
});

test('quality texts in every language; a long advice is cut', () => {
  for (const language of LANGUAGES) {
    for (const level of ['ok', 'warning', 'critical']) {
      assert.doesNotMatch(qualityText(level, language), /^quality_/);
    }
  }
  assert.equal(qualityText(null, 'fr'), null);
  const long = adviceText({ title: 'T', message: 'x'.repeat(400) });
  assert.equal(long.length, 240);
  assert.ok(long.endsWith('…'));
  assert.equal(adviceText(null), null);
  assert.equal(
    adviceText({ title: 'pH too high', message: 'Add pH minus.' }),
    'pH too high. Add pH minus.',
  );
  assert.equal(adviceText({ title: 'pH too high', message: null }), 'pH too high');
  assert.equal(adviceText({ title: null, message: null }), null);
});

test('the serial of a device or feature external id', () => {
  assert.equal(serialFromExternalId(DEVICE), SERIAL);
  assert.equal(serialFromExternalId(`${DEVICE}:water_quality`), SERIAL);
  assert.equal(serialFromExternalId('ext:other:thing'), null);
  assert.equal(serialFromExternalId(undefined), null);
});
