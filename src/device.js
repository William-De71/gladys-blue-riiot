// -----------------------------------------------------------------------------
// The devices of the Blue Riiot integration, offered on the Discovery screen.
//
// One device per Blue Connect of the account, "Blue Connect Go <pool name>":
//   - water temperature   temperature-sensor / decimal, °C
//   - pH                  ph-sensor / decimal
//   - redox (ORP)         orp-sensor / decimal, mV
//   - salinity            level-sensor / decimal, ppm (mg/L; Blue Riiot sends
//                         g/L), only on the models that measure it (Plus,
//                         Gold, salt editions): Gladys has no g/L unit
//   - water quality       text / text: good, to watch, out of range, the
//                         worst of pH, redox and salinity against the ideal
//                         ranges Blue Riiot sends with each measure
//   - advice              text / text: the advice of the Blue Connect app
//   - battery low         battery-low / binary
//
// External ids are built on the serial of the Blue device as the cloud knows
// it (the "key" of the app), never on a name.
//
// The cloud has no push: the integration reads it on its own timer (every 30
// minutes by default, beyond the 60 s Gladys polls at most), so `should_poll`
// is false. Every feature is read-only.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { waterQuality } from './read.js';
import { t } from './i18n.js';

const DEVICE_TYPE = 'blue';
// Gladys keeps texts in a column of its own; a long advice is cut there.
const MAX_TEXT_STATE = 240;

const FEATURE_KEYS = {
  TEMPERATURE: 'temperature',
  PH: 'ph',
  ORP: 'orp',
  SALINITY: 'salinity',
  WATER_QUALITY: 'water_quality',
  ADVICE: 'advice',
  BATTERY_LOW: 'battery_low',
};

const round = (value, digits) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : null;

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};

/**
 * @description A measure of the device itself, null for a test strip, an
 * expired value or a missing one.
 * @param {object} device - The device snapshot.
 * @param {string} name - The measure name.
 * @returns {object|null} The measure.
 */
function deviceMeasure(device, name) {
  const measure = device.values?.[name];
  return measure && !measure.expired && measure.issuer !== 'strip' ? measure : null;
}

/**
 * @description Whether the Blue device measures salinity (one of the measures
 * of the device itself, expired or not).
 * @param {object} device - The device snapshot.
 * @returns {boolean} True when it does.
 */
const measuresSalinity = (device) =>
  Boolean(device.values?.salinity && device.values.salinity.issuer !== 'strip');

/**
 * @description The text of a water quality level.
 * @param {string|null} level - ok, warning or critical.
 * @param {string} language - The language.
 * @returns {string|null} The text.
 * @example
 * qualityText('warning', 'fr'); // -> 'À surveiller'
 */
function qualityText(level, language) {
  return level ? t(`quality_${level}`, language) : null;
}

/**
 * @description The advice of the app in one line ("Enjoy! Water quality is at the top!").
 * @param {object|null} advice - `{ title, message }`.
 * @param {number} [max] - Longest text.
 * @returns {string|null} The text.
 */
function adviceText(advice, max = MAX_TEXT_STATE) {
  if (!advice) {
    return null;
  }
  // A title without a final mark ("pH too high") would run into the message.
  const title =
    advice.title && advice.message && !/[.!?:…]$/.test(advice.title)
      ? `${advice.title}.`
      : advice.title;
  const line = [title, advice.message].filter(Boolean).join(' ');
  if (!line) {
    return null;
  }
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// The features of a Blue device: their Gladys shape and their state. `state`
// returns a number, `{ text }`, or null when unknown (not published).
// `when` keeps a feature out of the devices that cannot have it.
const DEVICE_FEATURES = [
  {
    key: FEATURE_KEYS.TEMPERATURE,
    name: 'featureTemperature',
    shape: {
      ...sensor,
      category: CATEGORIES.TEMPERATURE_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.CELSIUS,
      min: -10,
      max: 50,
    },
    state: (device) => round(deviceMeasure(device, 'temperature')?.value, 1),
  },
  {
    key: FEATURE_KEYS.PH,
    name: 'featurePh',
    shape: {
      ...sensor,
      category: CATEGORIES.PH_SENSOR,
      type: TYPES.PH_SENSOR.DECIMAL,
      unit: UNITS.PH,
      min: 0,
      max: 14,
    },
    state: (device) => round(deviceMeasure(device, 'ph')?.value, 2),
  },
  {
    key: FEATURE_KEYS.ORP,
    name: 'featureOrp',
    shape: {
      ...sensor,
      category: CATEGORIES.ORP_SENSOR,
      type: TYPES.ORP_SENSOR.DECIMAL,
      unit: UNITS.MILLI_VOLT,
      min: 0,
      max: 1200,
    },
    state: (device) => round(deviceMeasure(device, 'orp')?.value, 0),
  },
  {
    key: FEATURE_KEYS.SALINITY,
    name: 'featureSalinity',
    when: measuresSalinity,
    shape: {
      ...sensor,
      category: CATEGORIES.LEVEL_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.PPM,
      min: 0,
      max: 20000,
    },
    state: (device) => {
      const grams = deviceMeasure(device, 'salinity')?.value;
      return typeof grams === 'number' ? Math.round(grams * 1000) : null;
    },
  },
  {
    key: FEATURE_KEYS.WATER_QUALITY,
    name: 'featureWaterQuality',
    shape: text,
    state: (device, language) => {
      const label = qualityText(waterQuality(device.values), language);
      return label ? { text: label } : null;
    },
  },
  {
    key: FEATURE_KEYS.ADVICE,
    name: 'featureAdvice',
    shape: text,
    state: (device) => {
      const line = adviceText(device.advice);
      return line ? { text: line } : null;
    },
  },
  {
    key: FEATURE_KEYS.BATTERY_LOW,
    name: 'featureBatteryLow',
    shape: {
      category: CATEGORIES.BATTERY_LOW,
      type: TYPES.BATTERY_LOW.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    },
    state: (device) =>
      typeof device.batteryLow === 'boolean' ? (device.batteryLow ? 1 : 0) : null,
  },
];

/**
 * @description The features a device has.
 * @param {object} device - The device snapshot.
 * @returns {Array<object>} The feature specs.
 */
const featuresOf = (device) => DEVICE_FEATURES.filter((spec) => !spec.when || spec.when(device));

/**
 * @description The external ids of a Blue device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} serial - The serial of the Blue device.
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, '0A1B2C3D').device; // -> 'ext:blue-riiot:blue:0A1B2C3D'
 */
function idsOf(gladys, serial) {
  return gladys.externalIds(DEVICE_TYPE, serial);
}

/**
 * @description The serial a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @returns {string|null} The serial.
 * @example
 * serialFromExternalId('ext:blue-riiot:blue:0A1B2C3D:ph'); // -> '0A1B2C3D'
 */
function serialFromExternalId(externalId) {
  const match = /:blue:([A-Za-z0-9_-]+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The name of a device: product and pool.
 * @param {object} device - The device snapshot.
 * @param {string} language - The language.
 * @returns {string} "Blue Connect Go Garden".
 */
function deviceName(device, language) {
  return t('deviceName', language, {
    product: device.productName ?? 'Blue Connect',
    pool: device.poolName ?? t('defaultPool', language),
  });
}

/**
 * @description The device of a Blue Connect.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - The device snapshot.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * buildDevice(gladys, { serial: '0A1B2C3D', poolId: 'abc', poolName: 'Garden', values: {} }, 'fr');
 */
function buildDevice(gladys, device, language = 'en') {
  const ids = idsOf(gladys, device.serial);
  return {
    name: deviceName(device, language),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'BLUE_SERIAL', value: device.serial },
      { name: 'BLUE_POOL_ID', value: device.poolId },
      ...(device.firmware ? [{ name: 'BLUE_FIRMWARE', value: device.firmware }] : []),
    ],
    features: featuresOf(device).map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description The states of a device. Unknown values are left out, never
 * published as 0.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - The device snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildDeviceStates(gladys, device, language) {
  const ids = idsOf(gladys, device.serial);
  return featuresOf(device).flatMap((spec) => {
    const value = spec.state(device, language);
    if (value === null) {
      return [];
    }
    const id = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    ];
  });
}

export {
  DEVICE_TYPE,
  FEATURE_KEYS,
  DEVICE_FEATURES,
  deviceMeasure,
  measuresSalinity,
  qualityText,
  adviceText,
  featuresOf,
  idsOf,
  serialFromExternalId,
  deviceName,
  buildDevice,
  buildDeviceStates,
};
