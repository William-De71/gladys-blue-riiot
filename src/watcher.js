// -----------------------------------------------------------------------------
// The reading loop: every `poll_interval` minutes, the pools of the account,
// their Blue devices, the last measures and the advice of the app.
//
// A round costs 1 request, then 2 per pool (its devices, its advice) and 2
// per Blue device (the device, its measures): 5 for the usual account of one
// pool and one Blue Connect.
//
// It keeps the snapshots the devices, widgets, scene actions and triggers
// read, and hands each round to the app with its transitions (tracker.js).
// A round never overlaps another one. A failing read keeps the last snapshots
// and goes to onError; the advice and the device details are secondary: when
// only they fail, the round goes on with what was known.
// -----------------------------------------------------------------------------

import { readPools, readPoolDevices, readDevice, readMeasurements, readFeed } from './read.js';
import { isStale, diffDevice } from './tracker.js';

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.blue - The Blue Riiot client.
 * @param {Function} options.isEnabled - `() => boolean`: an account can be read.
 * @param {Function} options.getIntervalMs - `() => number`.
 * @param {Function} options.getLanguage - `() => string`: language of the advice.
 * @param {Function} options.onRound - `async ({ devices, pools }) => void`,
 * each device as `{ snapshot, events, changed }`.
 * @param {Function} options.onError - `async (err) => void`.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ blue, isEnabled, getIntervalMs, getLanguage, onRound, onError, logger });
 * watcher.start();
 */
function createWatcher({
  blue,
  isEnabled,
  getIntervalMs,
  getLanguage,
  onRound,
  onError,
  now = () => Date.now(),
  logger,
}) {
  // serial -> snapshot
  let devices = new Map();
  let poolCount = 0;
  let fetchedAt = null;
  let timer = null;
  let running = null;
  let started = false;

  /**
   * @description Run a secondary read: an auth failure stops the round, any
   * other failure only loses this piece.
   * @param {Function} read - `async () => value`.
   * @param {string} label - What is read, for the log.
   * @returns {Promise<unknown>} The value, undefined when it failed.
   */
  async function secondary(read, label) {
    try {
      return await read();
    } catch (err) {
      if (err.kind === 'auth') {
        throw err;
      }
      logger.debug?.(`Blue Riiot ${label} skipped: ${err.message}`);
      return undefined;
    }
  }

  /**
   * @description One reading of the whole account.
   * @returns {Promise<void>}
   */
  async function readAll() {
    const language = getLanguage();
    const pools = readPools(await blue.listPools());
    const at = now();
    const next = new Map();
    const round = { devices: [], pools: pools.length };
    for (const pool of pools) {
      const serials = readPoolDevices(await blue.listPoolDevices(pool.id));
      if (serials.length === 0) {
        continue;
      }
      const feed = await secondary(() => blue.poolFeed(pool.id, language), 'advice');
      for (const serial of serials) {
        if (next.has(serial)) {
          continue;
        }
        const previous = devices.get(serial);
        const raw = await secondary(() => blue.getDevice(serial), 'device');
        const info = raw === undefined && previous ? previous : readDevice(raw);
        const measures = readMeasurements(await blue.lastMeasurements(pool.id, serial));
        // An empty answer (a hiccup, a device being set up): keep what was known.
        const known = Object.keys(measures.values).length > 0;
        const snapshot = {
          serial,
          poolId: pool.id,
          poolName: pool.name,
          productName: info.productName ?? null,
          productType: info.productType ?? null,
          firmware: info.firmware ?? null,
          batteryLow: info.batteryLow ?? null,
          lastSeen: info.lastSeen ?? null,
          measuredAt: known ? measures.measuredAt : (previous?.measuredAt ?? null),
          values: known ? measures.values : (previous?.values ?? {}),
          advice: feed === undefined ? (previous?.advice ?? null) : readFeed(feed),
        };
        snapshot.stale = isStale(snapshot, at);
        next.set(serial, snapshot);
        round.devices.push({
          snapshot,
          events: diffDevice(previous, snapshot),
          changed:
            !previous ||
            JSON.stringify({ ...previous, stale: null }) !==
              JSON.stringify({ ...snapshot, stale: null }),
        });
      }
    }
    devices = next;
    poolCount = pools.length;
    fetchedAt = at;
    await onRound(round);
  }

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getIntervalMs());
      timer.unref?.();
    }
  }

  /**
   * @description Read the account now; joins a round already running.
   * @returns {Promise<void>} Never rejects: failures go to onError.
   */
  function round() {
    if (running) {
      return running;
    }
    if (!isEnabled()) {
      return Promise.resolve();
    }
    running = readAll()
      .catch(async (err) => {
        logger.warn(`Blue Riiot reading failed: ${err.message}`);
        await onError(err);
      })
      .catch((err) => logger.error('Unable to report a reading failure', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    round,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    /** @description Forget everything: the next round is a new baseline. */
    reset: () => {
      devices = new Map();
      poolCount = 0;
      fetchedAt = null;
    },
    devices: () => [...devices.values()],
    device: (serial) => devices.get(serial) ?? null,
    poolCount: () => poolCount,
    fetchedAt: () => fetchedAt,
  };
}

export { createWatcher };
