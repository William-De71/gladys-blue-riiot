// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake Blue Riiot cloud.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, FETCH_MIN_INTERVAL_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import {
  blueCloud,
  rawMeasures,
  rawDevice,
  silent,
  NOW,
  HOUR,
  POOL_ID,
  SPA_ID,
  SERIAL,
  SPA_SERIAL,
  EMAIL,
  PASSWORD,
} from './helpers/fixtures.js';

const CONFIG = { email: EMAIL, password: PASSWORD };
const BLUE = `ext:test-integration:blue:${SERIAL}`;
const SPA = `ext:test-integration:blue:${SPA_SERIAL}`;

/**
 * @description The integration, connected to a fake Gladys and a fake Blue Riiot cloud.
 * @param {object} [options] - `{ config, cloud }`.
 * @returns {Promise<object>} `{ gladys, app, fetch, clock }`.
 */
async function startApp({ config = CONFIG, cloud = {} } = {}) {
  const clock = { now: NOW };
  const fetch = blueCloud({ now: () => clock.now, ...cloud });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, { fetchImpl: fetch, now: () => clock.now, logger: silent });
  await gladys.connect();
  return { gladys, app, fetch, clock };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  await gladys.fake.deviceCreated(device);
  return device;
};
const widget = async (gladys, key, options) =>
  (await gladys.fake.widgetGet(key, options)).data.content;
const sceneAction = async (gladys, key, fields) =>
  (await gladys.fake.sceneAction(key, fields)).data.outputs;
const action = async (gladys, language) => {
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  return (
    JSON.stringify(ack.data).match(new RegExp(`"${language}":"([^"]*)"`))?.[1] ??
    JSON.stringify(ack)
  );
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const signedCalls = (fetch) => fetch.calls.filter((call) => call.path !== 'user/login');

const TWO_POOLS = {
  pools: [
    { id: POOL_ID, name: 'Garden', devices: [SERIAL] },
    { id: SPA_ID, name: 'Spa', devices: [SPA_SERIAL] },
  ],
  devices: {
    [SERIAL]: { info: rawDevice(), measures: rawMeasures() },
    [SPA_SERIAL]: {
      info: rawDevice({ serial: SPA_SERIAL, product: 'Blue Connect Plus' }),
      measures: rawMeasures({ temperature: 37, salinity: 3.21 }),
    },
  },
  feeds: { [POOL_ID]: 'SWP_OK', [SPA_ID]: 'SWP_OK' },
};

test('the Blue Connect devices are offered after one login, accepted by the host API checks', async (t) => {
  const { gladys, fetch } = await startApp({ cloud: TWO_POOLS });
  t.after(() => gladys.fake.shutdown());
  assert.equal(fetch.state.logins, 1);
  // 1 pool list + per pool (devices, advice) + per device (device, measures)
  assert.equal(signedCalls(fetch).length, 1 + 2 * 2 + 2 * 2);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [BLUE, 'Blue Connect Go Garden'],
      [SPA, 'Blue Connect Plus Spa'],
    ],
  );
  const spa = gladys.fake.discoveredDevices.find((device) => device.external_id === SPA);
  assert.ok(spa.features.some((feature) => feature.external_id === `${SPA}:salinity`));
  const blue = gladys.fake.discoveredDevices.find((device) => device.external_id === BLUE);
  assert.ok(!blue.features.some((feature) => feature.external_id === `${BLUE}:salinity`));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /2 Blue Connect/);
  assert.equal(gladys.fake.states.length, 0, 'nothing before a device exists');
  // The measures are asked with the test strips.
  assert.ok(fetch.calls.some((call) => call.query === '?mode=blue_and_strip'));
});

test('creating a device publishes all its states, then only what changed', async (t) => {
  const { gladys, app, fetch } = await startApp({ cloud: TWO_POOLS });
  t.after(() => gladys.fake.shutdown());
  await created(gladys, SPA);
  assert.equal(gladys.fake.lastState(`${SPA}:temperature`), 37);
  assert.equal(gladys.fake.lastState(`${SPA}:ph`), 7.42, 'the device value, not the strip');
  assert.equal(gladys.fake.lastState(`${SPA}:orp`), 702);
  assert.equal(gladys.fake.lastState(`${SPA}:salinity`), 3210);
  assert.equal(gladys.fake.lastState(`${SPA}:water_quality`), 'Good');
  assert.equal(gladys.fake.lastState(`${SPA}:battery_low`), 0);
  assert.equal(gladys.fake.lastState(`${SPA}:advice`), 'Enjoy! Water quality is at the top!');
  const sent = gladys.fake.states.length;

  await app.watcher.round();
  assert.equal(gladys.fake.states.length, sent, 'same answer, nothing sent again');

  fetch.state.devices[SPA_SERIAL].measures = rawMeasures({
    at: NOW,
    temperature: 37,
    ph: 7.9,
    salinity: 3.21,
  });
  await app.watcher.round();
  assert.equal(gladys.fake.lastState(`${SPA}:ph`), 7.9);
  assert.equal(gladys.fake.lastState(`${SPA}:water_quality`), 'To watch');
  assert.ok(gladys.fake.states.length - sent <= 2, 'only the changed values');
});

test('transitions fire scene events once, never at the first reading', async (t) => {
  const { gladys, app, fetch, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');

  fetch.state.devices[SERIAL] = {
    info: rawDevice({ batteryLow: true }),
    measures: rawMeasures({ at: NOW, ph: 8.6, orp: 700 }),
  };
  fetch.state.feeds[POOL_ID] = 'SWP_PH_HIGH';
  await app.watcher.round();
  assert.equal(eventsOf(gladys, 'new_measure').length, 1);
  assert.equal(eventsOf(gladys, 'new_measure')[0].data.device, BLUE);
  const out = eventsOf(gladys, 'out_of_range');
  assert.deepEqual(
    out.map((event) => [event.data.measure, event.data.level, event.data.previous_level]),
    [['ph', 'critical', 'ok']],
  );
  assert.equal(eventsOf(gladys, 'new_advice')[0].data.advice_id, 'SWP_PH_HIGH');
  assert.equal(eventsOf(gladys, 'battery_low').length, 1);

  await app.watcher.round();
  assert.equal(gladys.fake.sceneEvents.length, 4, 'nothing new, nothing fired');

  fetch.state.devices[SERIAL].measures = rawMeasures({ at: NOW + HOUR, ph: 7.4 });
  clock.now = NOW + HOUR;
  await app.watcher.round();
  assert.equal(eventsOf(gladys, 'back_in_range')[0].data.measure, 'ph');

  clock.now = NOW + 50 * HOUR;
  await app.watcher.round();
  await app.watcher.round();
  assert.equal(eventsOf(gladys, 'measures_stopped').length, 1);
  assert.equal(eventsOf(gladys, 'measures_stopped')[0].data.hours, 49);
});

test('a refused login pauses the readings until the configuration is saved', async (t) => {
  const { gladys, app, fetch } = await startApp({ config: { email: EMAIL, password: 'wrong' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the e-mail or password/);
  assert.equal(app.isBlocked(), true);
  const calls = fetch.calls.length;
  await app.watcher.round();
  await app.watcher.round();
  assert.equal(fetch.calls.length, calls, 'never retried on a timer');
  const content = await widget(gladys, WIDGETS.POOL, { language: 'fr' });
  assert.match(content.components[0].text, /en pause/);

  await gladys.fake.configUpdated({ email: EMAIL, password: PASSWORD });
  assert.equal(app.isBlocked(), false);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('expired or revoked credentials are renewed, once per request', async (t) => {
  const { gladys, app, fetch, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(fetch.state.logins, 1);
  await app.watcher.round();
  assert.equal(fetch.state.logins, 1, 'the session is kept between rounds');

  clock.now = NOW + HOUR - 60000;
  await app.watcher.round();
  assert.equal(fetch.state.logins, 2, 'renewed before it expires');

  fetch.state.tokens.clear();
  await app.watcher.round();
  assert.equal(fetch.state.logins, 3, 'revoked: one new login');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(app.isBlocked(), false, 'a revoked session is not a refused login');
});

test('a rate limit, an outage and a broken answer are reported, then the recovery', async (t) => {
  const { gladys, app, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  fetch.state.failure = 429;
  await app.watcher.round();
  assert.match(gladys.fake.connectionStatus.message.en, /limits the requests/);
  fetch.state.failure = 'network';
  await app.watcher.round();
  assert.match(gladys.fake.connectionStatus.message.fr, /ne répond pas/);
  assert.equal(app.watcher.devices().length, 1, 'the last snapshots are kept');
  fetch.state.failure = null;
  await app.watcher.round();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(app.isBlocked(), false);
});

test('a failing advice does not stop the reading: the last advice is kept', async (t) => {
  const { gladys, app, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  fetch.state.failure = 'feed';
  fetch.state.devices[SERIAL].measures = rawMeasures({ at: NOW, orp: 640 });
  await app.watcher.round();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const device = app.watcher.device(SERIAL);
  assert.equal(device.values.orp.value, 640);
  assert.equal(device.advice.id, 'SWP_OK');
});

test('without an account: nothing is read and the user is told what to do', async (t) => {
  const { gladys, fetch } = await startApp({ config: {} });
  t.after(() => gladys.fake.shutdown());
  assert.equal(fetch.calls.length, 0);
  assert.match(gladys.fake.connectionStatus.message.fr, /compte Blue Connect/);
  const content = await widget(gladys, WIDGETS.POOL, { language: 'en' });
  assert.match(content.components[0].text, /e-mail and password/);
});

test('the test button counts pools and devices, and lifts a refused login', async (t) => {
  const { gladys, app, fetch } = await startApp({ cloud: TWO_POOLS });
  t.after(() => gladys.fake.shutdown());
  assert.match(await action(gladys, 'fr'), /2 piscine\(s\), 2 Blue Connect/);
  fetch.state.password = 'changed in the app';
  assert.match(await action(gladys, 'en'), /refused the e-mail or password/);
  assert.equal(app.isBlocked(), false, 'a click is not a timer: it never blocks');

  const blocked = await startApp({ config: { email: EMAIL, password: 'wrong' } });
  t.after(() => blocked.gladys.fake.shutdown());
  blocked.fetch.state.password = 'wrong';
  assert.match(await action(blocked.gladys, 'en'), /Account accepted/);
  assert.equal(blocked.app.isBlocked(), false);
});

test('the widget reads the snapshots, with the chart once the device exists', async (t) => {
  const { gladys, fetch } = await startApp({ cloud: TWO_POOLS });
  t.after(() => gladys.fake.shutdown());
  const calls = fetch.calls.length;
  const before = await widget(gladys, WIDGETS.POOL, { language: 'fr', settings: {} });
  assert.deepEqual(validateWidgetContent(before), []);
  assert.ok(!before.components.some((c) => c.type === 'chart'));
  await created(gladys, SPA);
  const after = await widget(gladys, WIDGETS.POOL, {
    language: 'fr',
    settings: { device: SPA, chart: 'salinity' },
  });
  assert.deepEqual(validateWidgetContent(after), []);
  assert.deepEqual(after.components.find((c) => c.type === 'chart').device_features, [
    `${SPA}:salinity`,
  ]);
  assert.equal(fetch.calls.length, calls, 'a widget never costs a request');
});

test('get_device answers from the last reading, without a request', async (t) => {
  const { gladys, fetch } = await startApp({ cloud: TWO_POOLS });
  t.after(() => gladys.fake.shutdown());
  const calls = fetch.calls.length;
  const first = await sceneAction(gladys, SCENE_ACTIONS.GET_DEVICE, {});
  assert.equal(first.temperature, 26.43);
  assert.equal(first.ph, 7.418);
  assert.equal(first.salinity, -1);
  assert.equal(first.free_chlorine, 1.5, 'the test strip, as entered');
  assert.equal(first.water_quality, 'ok');
  assert.equal(first.battery_low, false);
  const spa = await sceneAction(gladys, SCENE_ACTIONS.GET_DEVICE, { device: SPA });
  assert.equal(spa.salinity, 3.21);
  assert.equal(fetch.calls.length, calls);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a scene action never fires a trigger');
});

test('fetch_measure asks the Blue Extender, at most every 10 minutes', async (t) => {
  const { gladys, fetch, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const asked = () =>
    fetch.calls.filter((call) => call.path.endsWith('releaseLastUnprocessedEvent')).length;
  const first = await sceneAction(gladys, SCENE_ACTIONS.FETCH_MEASURE, { device: BLUE });
  assert.equal(first.requested, true);
  assert.equal(first.message, 'Last unprocessed event released');
  const second = await sceneAction(gladys, SCENE_ACTIONS.FETCH_MEASURE, { device: BLUE });
  assert.equal(second.requested, false);
  assert.equal(asked(), 1);
  clock.now = NOW + FETCH_MIN_INTERVAL_MS;
  assert.equal((await sceneAction(gladys, SCENE_ACTIONS.FETCH_MEASURE, {})).requested, true);
  assert.equal(asked(), 2);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('another account starts a new baseline and the new interval applies', async (t) => {
  const { gladys, app, fetch } = await startApp();
  t.after(() => gladys.fake.shutdown());
  fetch.state.email = 'other@example.com';
  fetch.state.devices[SERIAL].measures = rawMeasures({ at: NOW, ph: 8.6 });
  await gladys.fake.configUpdated({
    email: 'other@example.com',
    password: PASSWORD,
    poll_interval: 60,
  });
  assert.equal(app.getConfig().pollInterval, 60);
  assert.equal(fetch.state.logins, 2, 'logged in again for the other account');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'another account replays nothing');
});
