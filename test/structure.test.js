// -----------------------------------------------------------------------------
// Non-regression of everything users store: the device and feature external
// ids, the fields the Discovery "Update" button compares (category, type,
// unit, min, max, step), and every key of the manifest a scene, a widget or a
// saved configuration refers to.
//
// test/fixtures/discovery.baseline.json was generated before the first release (0.1.0). A
// failure here means existing users would have to delete and recreate a
// device, or would lose a scene or a widget setting: never update the
// baseline without a documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDevice } from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys } from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/discovery.baseline.json');
const manifest = read('../gladys-assistant-integration.json');

const ETERNAL = [
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'step',
  'read_only',
  'has_feedback',
];
const BLUE = {
  serial: '0A1B2C3D',
  poolId: '20d3be3a-6627-4cba-9939-40fb13d0d1db',
  poolName: 'Garden',
  productName: 'Blue Connect Go',
  firmware: '2.3.0',
  values: { ph: { name: 'ph', value: 7.4, issuer: 'sigfox' } },
};
// A model that measures salinity has one more feature.
const BLUE_SALT = {
  ...BLUE,
  serial: '0E1F2A3B',
  productName: 'Blue Connect Plus',
  values: { ...BLUE.values, salinity: { name: 'salinity', value: 3.2, issuer: 'sigfox' } },
};
const pick = (feature) =>
  Object.fromEntries(
    ETERNAL.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));
const shape = (device) => ({
  external_id: device.external_id,
  should_poll: device.should_poll,
  params: device.params.map((param) => param.name),
  features: device.features.map(pick),
  options: device.features.flatMap((feature) =>
    (feature.supported_options ?? []).map((option) => option.value),
  ),
});

test('the devices keep their external ids and the fields Discovery compares, in every language', () => {
  for (const language of LANGUAGES) {
    assert.deepEqual(
      shape(buildDevice(fakeGladys, BLUE, language)),
      baseline.devices.blue,
      language,
    );
    assert.deepEqual(
      shape(buildDevice(fakeGladys, BLUE_SALT, language)),
      baseline.devices.blue_salt,
      language,
    );
  }
});

test('no configuration key disappears or changes type', () => {
  const current = byKey(manifest.config_schema);
  for (const { key, type } of baseline.manifest.config_schema) {
    assert.equal(current.get(key)?.type, type, `config_schema.${key}`);
  }
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    const fields = byKey(now.fields);
    for (const { key, options } of trigger.fields) {
      assert.ok(fields.has(key), `${trigger.key}.fields.${key}`);
      const values = (fields.get(key).options ?? []).map((option) => option.value);
      options.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields and outputs', () => {
  const current = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const now = current.get(action.key);
    assert.ok(now, `scene_actions.${action.key}`);
    action.fields.forEach((field) =>
      assert.ok(keys(now.fields).includes(field), `${action.key}.${field}`),
    );
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.outputs.${key}`);
    }
  }
});

test('widgets keep their keys, settings and option values', () => {
  const current = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    const now = current.get(widget.key);
    assert.ok(now, `widgets.${widget.key}`);
    const settings = byKey(now.settings);
    for (const key of widget.settings) {
      assert.ok(settings.has(key), `${widget.key}.settings.${key}`);
    }
    for (const [key, values] of Object.entries(widget.options)) {
      const options = settings.get(key).options.map((option) => option.value);
      values.forEach((value) =>
        assert.ok(options.includes(value), `${widget.key}.${key}: ${value}`),
      );
    }
  }
});
