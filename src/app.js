// -----------------------------------------------------------------------------
// The Blue Riiot integration: every handler, registered on a Gladys client.
//
// Brings the Blue Connect pool analysers of a Blue Riiot account into Gladys:
//   - a device per Blue Connect (water temperature, pH, redox, salinity on the
//     models that measure it, water quality, advice of the app, battery low),
//     offered on the Discovery screen (see device.js);
//   - scene triggers: new measure, a value out of its ideal range or back in
//     it, a new advice, battery low, measures stopped (see tracker.js,
//     events.js);
//   - scene actions: read a Blue Connect; ask the Blue Extender for its
//     newest measure;
//   - a dashboard widget: the pool water at a glance (see widgets.js).
//
// Blue Riiot has no local API and no public one: the integration uses the
// cloud interface of the Blue Connect app with the e-mail and password of the
// account (see blue-api.js). Transport: cloud only. A refused login stops the
// readings until the configuration is saved again: retrying a wrong password
// every half hour could lock the account.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasAccount,
  accountSignature,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createBlueClient } from './blue-api.js';
import { readPools, readPoolDevices } from './read.js';
import { createWatcher } from './watcher.js';
import { idsOf, serialFromExternalId, buildDevice, buildDeviceStates } from './device.js';
import { buildDeviceEvent, buildDeviceOutputs } from './events.js';
import { WIDGETS, messageContent, readPoolSettings, buildPoolWidget } from './widgets.js';
import { t, all } from './i18n.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = { TEST_CONNECTION: 'test_connection' };
const SCENE_ACTIONS = { GET_DEVICE: 'get_device', FETCH_MEASURE: 'fetch_measure' };
// The Blue Extender is asked at most this often per Blue Connect: a scene run
// every minute must not flood the cloud.
const FETCH_MIN_INTERVAL_MS = 10 * 60000;

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch implementation (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, getConfig: Function, isBlocked: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  { fetchImpl = globalThis.fetch, now = () => Date.now(), logger = sdkLogger } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status sent, to send it again only when it changes.
  let lastStatus = null;
  // The login was refused: no more reading until the configuration is saved.
  let blocked = false;
  // serial -> when the Blue Extender was last asked for a measure.
  const fetchedMeasures = new Map();

  const blue = createBlueClient({
    getAccount: () => ({ email: config.email, password: config.password }),
    fetch: fetchImpl,
    now,
    userAgent: `${name}/${version} (+${homepage})`,
  });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (feature names and texts, advice of the app, scene summaries and outputs).
   * @returns {string} The language.
   */
  function textLanguage() {
    return config.language === AUTO_LANGUAGE ? language : config.language;
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The multi-language message of a failure.
   * @param {Error} err - A BlueRiiotError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    switch (err.kind) {
      case 'auth':
        if (!hasAccount(config)) {
          return all('noAccount');
        }
        return all(err.login ? 'statusLoginRefused' : 'statusNotAllowed');
      case 'rate_limit':
        return all('statusRateLimited');
      case 'unexpected':
        return all('statusUnexpected');
      default:
        return all('statusUnreachable');
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (serial) => createdDevices.has(idsOf(gladys, serial).device);

  /**
   * @description Publish the states of the created devices that changed. The
   * SDK remembers what it sent (publishChangedStates) and forgets a device when
   * the user creates it: its states then go out again in full.
   * @param {object[]} devices - Device snapshots.
   * @returns {Promise<void>}
   */
  async function publishStates(devices) {
    const states = devices
      .filter((device) => isCreated(device.serial))
      .flatMap((device) => buildDeviceStates(gladys, device, textLanguage()));
    if (states.length > 0) {
      await gladys.publishChangedStates(states);
    }
  }

  const publishQuietly = (devices) =>
    publishStates(devices).catch((err) =>
      logger.warn(`Unable to publish the states: ${err.message}`),
    );

  /**
   * @description Ask the dashboards to read the widget again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`${data.device_name}: ${key}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    blue,
    isEnabled: () => hasAccount(config) && !blocked,
    getIntervalMs: () => config.pollInterval * 60000,
    getLanguage: textLanguage,
    onRound: async ({ devices, pools }) => {
      for (const { snapshot, events } of devices) {
        for (const event of events) {
          await publishEvent(buildDeviceEvent(gladys, snapshot, event, textLanguage(), now()));
        }
      }
      const changed = devices.filter((device) => device.changed).map((device) => device.snapshot);
      if (changed.length > 0) {
        await publishQuietly(changed);
        refreshWidgets();
      }
      await reportStatus(
        true,
        devices.length === 0
          ? all(pools === 0 ? 'statusNoPool' : 'statusNoDevice')
          : all('statusConnected', { devices: devices.length }),
      );
    },
    onError: async (err) => {
      if (err.kind === 'auth' && err.login) {
        // Never retry a refused login on a timer: it could lock the account.
        blocked = true;
      }
      await reportStatus(false, errorMessage(err));
    },
    now,
    logger,
  });

  /**
   * @description Offer every Blue Connect read on the Discovery screen.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices() {
    const devices = hasAccount(config)
      ? watcher.devices().map((device) => buildDevice(gladys, device, textLanguage()))
      : [];
    await gladys.publishDiscoveredDevices(devices);
    return devices.length;
  }

  /**
   * @description The Blue Connect a widget or a scene action targets: the
   * chosen device, or the first one of the account.
   * @param {unknown} deviceExternalId - The `source: "devices"` value.
   * @returns {object|null} The snapshot, null when none is known.
   */
  function resolveDevice(deviceExternalId) {
    const serial = serialFromExternalId(deviceExternalId);
    return (serial && watcher.device(serial)) || watcher.devices()[0] || null;
  }

  // --- Dashboard widget --------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.POOL, async ({ settings = {}, language: lang, units }) => {
    rememberLanguage(lang);
    if (!hasAccount(config)) {
      return messageContent(t('noAccount', lang));
    }
    if (blocked) {
      return messageContent(t('statusLoginRefused', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    const device = resolveDevice(settings.device);
    if (!device) {
      return messageContent(t('noDevice', lang));
    }
    return buildPoolWidget({
      device,
      language: lang,
      units,
      now: now(),
      pollMinutes: config.pollInterval,
      settings: readPoolSettings(settings),
      featureId: isCreated(device.serial) ? idsOf(gladys, device.serial).feature : null,
    });
  });

  // --- Scene actions -----------------------------------------------------------------
  /**
   * @description The Blue Connect of a scene action; throws when none is known.
   * @param {unknown} deviceExternalId - The field value.
   * @returns {object} The snapshot.
   */
  function actionDevice(deviceExternalId) {
    if (!hasAccount(config)) {
      throw new Error('No Blue Riiot account is configured');
    }
    if (blocked) {
      throw new Error('Blue Riiot refused the login: save the configuration again');
    }
    const device = resolveDevice(deviceExternalId);
    if (!device) {
      throw new Error('No Blue Connect is known in this account yet');
    }
    return device;
  }

  // The values of the last reading: a Blue Connect measures every 20 minutes
  // at best, a fresh request would not know more.
  gladys.onSceneAction(SCENE_ACTIONS.GET_DEVICE, async (fields) =>
    buildDeviceOutputs(actionDevice(fields.device), textLanguage()),
  );

  // Asks the cloud to take over the newest measure the Blue Extender keeps
  // (the "Wi-Fi" refresh of the app). It does not start a measure, and the
  // new values arrive with the next reading: the action itself fires no
  // scene trigger.
  gladys.onSceneAction(SCENE_ACTIONS.FETCH_MEASURE, async (fields) => {
    const device = actionDevice(fields.device);
    const last = fetchedMeasures.get(device.serial);
    if (last !== undefined && now() - last < FETCH_MIN_INTERVAL_MS) {
      return { requested: false, message: t('fetchTooSoon', textLanguage()) };
    }
    const answer = await blue.releaseLastMeasure(device.serial);
    fetchedMeasures.set(device.serial, now());
    const text = typeof answer?.message === 'string' ? answer.message.trim().slice(0, 500) : '';
    return { requested: true, message: text || t('fetchRequested', textLanguage()) };
  });

  // --- Device commands ---------------------------------------------------------------
  // Every feature is read-only.
  gladys.onSetValue(async (device, deviceFeature) => {
    throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
  });

  // --- Configuration screen actions --------------------------------------------------
  // A click on the button is a deliberate try: it logs in even after a
  // refusal, and a success lifts the block.
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasAccount(config)) {
      return all('noAccount');
    }
    try {
      blue.logout();
      const pools = readPools(await blue.listPools());
      let devices = 0;
      for (const pool of pools) {
        devices += readPoolDevices(await blue.listPoolDevices(pool.id)).length;
      }
      if (blocked) {
        blocked = false;
        watcher.round().catch(() => {});
      }
      return all('testOk', { pools: pools.length, devices });
    } catch (err) {
      return errorMessage(err);
    }
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round();
    const count = await publishDiscoveredDevices();
    logger.info(`Scan: ${count} Blue Connect device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly(watcher.devices());
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read the cloud now and offer the devices; report a missing account.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    if (!hasAccount(config)) {
      await reportStatus(false, all('noAccount'));
    }
    await watcher.round();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousAccount = accountSignature(config);
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: Blue Riiot read every ${config.pollInterval} min`);
    // Saving the configuration is the way out of a refused login.
    blocked = false;
    if (accountSignature(config) !== previousAccount) {
      // Maybe another account: log in again, start from a fresh baseline.
      blue.logout();
      watcher.reset();
    }
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await loadConfig();
    await refreshCreatedDevices();
    lastStatus = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
  });

  return { watcher, getConfig: () => config, isBlocked: () => blocked };
}

export { createApp, ACTIONS, SCENE_ACTIONS, FETCH_MIN_INTERVAL_MS };
