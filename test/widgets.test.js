import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { buildPoolWidget, readPoolSettings, messageContent, advice } from '../src/widgets.js';
import { readMeasurements, readDevice } from '../src/read.js';
import { isStale } from '../src/tracker.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, deviceSnapshot, SERIAL, NOW, HOUR } from './helpers/fixtures.js';

const snapshot = (options) => {
  const device = deviceSnapshot(options, readMeasurements, readDevice);
  return { ...device, stale: isStale(device, NOW) };
};
const featureId = fakeGladys.externalIds('blue', SERIAL).feature;
const valid = (content) => {
  assert.deepEqual(validateWidgetContent(content), [], JSON.stringify(content));
  const types = content.components.map((c) => c.type);
  const count = (list) => types.filter((type) => list.includes(type)).length;
  assert.ok(content.components.length <= 8);
  assert.ok(count(['value', 'gauge']) <= 6);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1);
  assert.ok(count(['text']) <= 2 && count(['status']) <= 1);
  for (const component of content.components.filter((c) => c.type === 'status')) {
    component.items.forEach((item) => assert.ok(item.value, 'a row without value is dropped'));
  }
};

test('the pool widget is valid in every language, setting and state', () => {
  const devices = [
    snapshot(),
    snapshot({ measures: { salinity: 3.2, ph: 8.6, orp: 600 }, device: { batteryLow: true } }),
    snapshot({ measures: { at: NOW - 60 * HOUR } }),
    snapshot({ measures: { temperature: null, issuer: 'mobileapp' }, advice: null }),
    snapshot({ measures: { issuer: 'carrier-pigeon' } }),
  ];
  for (const language of LANGUAGES) {
    for (const device of devices) {
      for (const chart of ['temperature', 'salinity', 'none']) {
        for (const units of ['metric', 'imperial']) {
          const content = buildPoolWidget({
            device,
            language,
            units,
            now: NOW,
            pollMinutes: 30,
            settings: readPoolSettings({ chart }),
            featureId,
          });
          valid(content);
          assert.equal(content.ttl_seconds, 1800);
        }
      }
    }
  }
  valid(messageContent('x'));
});

test('tiles colored by the ranges of Blue Riiot, chart, advice and status rows', () => {
  const content = buildPoolWidget({
    device: snapshot({ measures: { salinity: 3.2, ph: 7.9, orp: 300 } }),
    language: 'fr',
    now: NOW,
    pollMinutes: 30,
    settings: readPoolSettings({ chart: 'salinity' }),
    featureId,
  });
  assert.equal(content.components[0].text, 'Mesuré il y a 1 h · Blue Connect Go Garden');
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.label, tile.value, tile.color]),
    [
      ['Eau', 26.4, 'success'],
      ['pH', 7.9, 'warning'],
      ['Redox', 300, 'danger'],
      ['Sel', 3.2, 'success'],
    ],
  );
  const chart = content.components.find((c) => c.type === 'chart');
  assert.deepEqual(chart.device_features, [featureId('salinity')]);
  assert.equal(chart.unit, 'ppm');
  const body = content.components.find((c) => c.type === 'text' && c.variant === 'body');
  assert.equal(body.text, 'Enjoy! Water quality is at the top!');
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value, row.color]),
    [
      ['Qualité de l’eau', 'Hors plage', 'danger'],
      ['Batterie', 'OK', 'success'],
      ['Envoyée par', 'Sigfox', 'neutral'],
    ],
  );
});

test('no salinity tile nor chart on a model without it; no chart before the device exists', () => {
  const plain = buildPoolWidget({
    device: snapshot(),
    language: 'en',
    now: NOW,
    pollMinutes: 30,
    settings: readPoolSettings({ chart: 'salinity' }),
    featureId,
  });
  assert.equal(plain.components.filter((c) => c.type === 'value').length, 3);
  assert.ok(!plain.components.some((c) => c.type === 'chart'));
  const uncreated = buildPoolWidget({
    device: snapshot(),
    language: 'en',
    now: NOW,
    pollMinutes: 30,
  });
  assert.ok(!uncreated.components.some((c) => c.type === 'chart'));
});

test('°F with imperial units; no measure at all is one message', () => {
  const content = buildPoolWidget({
    device: snapshot(),
    language: 'en',
    units: 'imperial',
    now: NOW,
    pollMinutes: 30,
  });
  const water = content.components.find((c) => c.type === 'value');
  assert.deepEqual([water.value, water.unit], [79.6, '°F']);
  const empty = buildPoolWidget({
    device: { ...snapshot(), measuredAt: null, values: {} },
    language: 'es',
    now: NOW,
    pollMinutes: 30,
  });
  assert.equal(empty.components.length, 1);
  assert.match(empty.components[0].text, /aún sin medida/);
});

test('advice: the app, or why measures stopped', () => {
  assert.equal(advice(snapshot(), 'en', NOW), 'Enjoy! Water quality is at the top!');
  assert.match(advice(snapshot({ advice: null }), 'de', NOW), /kein Hinweis/);
  const stale = snapshot({ measures: { at: NOW - 60 * HOUR } });
  assert.match(advice(stale, 'fr', NOW), /Aucune mesure depuis 60 h/);
});

test('settings: unknown values fall back to the defaults', () => {
  assert.deepEqual(readPoolSettings({ chart: 'filtration', interval: 'forever' }), {
    chart: 'temperature',
    interval: 'last-week',
  });
});
