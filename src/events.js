// -----------------------------------------------------------------------------
// Scene events and scene action outputs of the integration.
//
// The tracker says what happened; this module writes the flat `data` of the
// event the core matches against the scene triggers. Every event carries:
//   - `device`       the device external id: the value of the "Device"
//                    filter (a `source: "devices"` select);
//   - `device_name`  "Blue Connect Go Garden", readable by the actions;
//   - `summary`      a sentence ready to put in a message;
// plus the fields of its kind. Values are scalars (null when Blue Riiot did
// not say), texts cut at 1,000 characters.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS, STALE_HOURS } from './tracker.js';
import { waterQuality } from './read.js';
import { idsOf, deviceName, deviceMeasure, qualityText, adviceText } from './device.js';
import { t, formatNumber } from './i18n.js';

const MAX_TEXT = 1000;
const clip = (value) => String(value ?? '').slice(0, MAX_TEXT);
const iso = (instant) => (Number.isFinite(instant) ? new Date(instant).toISOString() : null);
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
// Digits a measure is written with.
const DIGITS = { temperature: 1, ph: 2, orp: 0, salinity: 1 };
const UNITS = { temperature: ' °C', ph: '', orp: ' mV', salinity: ' g/L' };

/**
 * @description "pH 7.9" / "redox 702 mV" for a measure value.
 * @param {string} name - The measure.
 * @param {number|null} value - The value.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function valueText(name, value, language) {
  return `${t(`measure_${name}`, language)} ${formatNumber(value, language, DIGITS[name] ?? 1)}${UNITS[name] ?? ''}`;
}

/**
 * @description The values a device measured itself (null when unknown).
 * @param {object} device - The device snapshot.
 * @returns {object} `{ temperature, ph, orp, salinity }`.
 */
function measureValues(device) {
  return {
    temperature: finite(deviceMeasure(device, 'temperature')?.value),
    ph: finite(deviceMeasure(device, 'ph')?.value),
    orp: finite(deviceMeasure(device, 'orp')?.value),
    salinity: finite(deviceMeasure(device, 'salinity')?.value),
  };
}

/**
 * @description "Blue Connect Go Garden: water 26.4 °C, pH 7.2, redox 702 mV."
 * @param {string} name - The device name.
 * @param {object} values - From measureValues.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function measureSummary(name, values, language) {
  const parts = ['temperature', 'ph', 'orp', 'salinity']
    .filter((key) => values[key] !== null)
    .map((key) => valueText(key, values[key], language));
  return parts.length > 0
    ? t('summaryMeasure', language, { name, values: parts.join(', ') })
    : `${name}: ${t('noMeasure', language)}`;
}

/**
 * @description The event of a device transition.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - The device snapshot.
 * @param {object} event - From diffDevice.
 * @param {string} language - Language of the summary.
 * @param {number} now - Now, in ms.
 * @returns {{ key: string, data: object }} The event.
 * @example
 * const { key, data } = buildDeviceEvent(gladys, device, { key: 'new_measure' }, 'fr', Date.now());
 * await gladys.publishSceneEvent(key, data);
 */
function buildDeviceEvent(gladys, device, event, language, now) {
  const name = deviceName(device, language);
  const data = { device: idsOf(gladys, device.serial).device, device_name: clip(name) };
  switch (event.key) {
    case SCENE_TRIGGERS.NEW_MEASURE: {
      const values = measureValues(device);
      Object.assign(data, values, {
        water_quality: waterQuality(device.values),
        measured_at: iso(device.measuredAt),
        summary: clip(measureSummary(name, values, language)),
      });
      break;
    }
    case SCENE_TRIGGERS.OUT_OF_RANGE:
    case SCENE_TRIGGERS.BACK_IN_RANGE: {
      const measure = device.values[event.measure];
      const out = event.key === SCENE_TRIGGERS.OUT_OF_RANGE;
      Object.assign(data, {
        measure: event.measure,
        value: finite(measure?.value),
        ...(out ? { level: event.level } : {}),
        previous_level: event.previous ?? null,
        ok_min: finite(measure?.okMin),
        ok_max: finite(measure?.okMax),
        summary: clip(
          t(out ? `summaryOut_${event.level}` : 'summaryBack', language, {
            name,
            value: valueText(event.measure, measure?.value ?? null, language),
            min: formatNumber(measure?.okMin ?? null, language, DIGITS[event.measure] ?? 1),
            max: formatNumber(measure?.okMax ?? null, language, DIGITS[event.measure] ?? 1),
          }),
        ),
      });
      break;
    }
    case SCENE_TRIGGERS.NEW_ADVICE:
      Object.assign(data, {
        advice_id: device.advice?.id ?? null,
        title: device.advice?.title ? clip(device.advice.title) : null,
        message: device.advice?.message ? clip(device.advice.message) : null,
        summary: clip(
          t('summaryAdvice', language, { name, advice: adviceText(device.advice, MAX_TEXT) }),
        ),
      });
      break;
    case SCENE_TRIGGERS.BATTERY_LOW:
      Object.assign(data, { summary: clip(t('summaryBattery', language, { name })) });
      break;
    case SCENE_TRIGGERS.MEASURES_STOPPED: {
      const hours = Number.isFinite(device.measuredAt)
        ? Math.floor((now - device.measuredAt) / 3600000)
        : STALE_HOURS;
      Object.assign(data, {
        last_measure_at: iso(device.measuredAt),
        hours,
        summary: clip(t('summaryStopped', language, { name, hours })),
      });
      break;
    }
    default:
      throw new Error(`Unknown device event: ${event.key}`);
  }
  return { key: event.key, data };
}

/**
 * @description The outputs of the get_device scene action. Numbers Blue
 * Riiot did not send are -1 (outputs are typed), texts are empty.
 * @param {object} device - The device snapshot.
 * @param {string} language - Language of the texts.
 * @returns {object} The outputs.
 */
function buildDeviceOutputs(device, language) {
  const name = deviceName(device, language);
  const values = measureValues(device);
  const number = (value) => value ?? -1;
  // Test strips are entered by hand in the app: they are given as they are.
  const strip = (key) => finite(device.values?.[key]?.value);
  const quality = waterQuality(device.values);
  return {
    temperature: number(values.temperature),
    ph: number(values.ph),
    orp: number(values.orp),
    salinity: number(values.salinity),
    conductivity: number(finite(deviceMeasure(device, 'conductivity')?.value)),
    free_chlorine: number(strip('fcl')),
    alkalinity: number(strip('ta')),
    water_quality: quality ?? '',
    water_quality_text: qualityText(quality, language) ?? '',
    battery_low: device.batteryLow === true,
    measured_at: iso(device.measuredAt) ?? '',
    advice: adviceText(device.advice, MAX_TEXT) ?? '',
    summary: clip(measureSummary(name, values, language)),
  };
}

export { measureValues, measureSummary, buildDeviceEvent, buildDeviceOutputs };
