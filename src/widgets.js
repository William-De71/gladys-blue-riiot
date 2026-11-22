// -----------------------------------------------------------------------------
// Dashboard widget of the Blue Riiot integration.
//
//   - `pool`  the water of a pool at a glance: temperature, pH, redox and
//             salinity tiles colored by the ideal ranges Blue Riiot sends
//             with each measure, the history of one of them (the chart reads
//             the states Gladys already keeps), the advice of the Blue
//             Connect app, the water quality and the battery.
//
// The contents come from the snapshots of the last reading: a widget never
// costs a request to the cloud. Every text exists in the four languages (the
// content is cached per language and units).
// -----------------------------------------------------------------------------

import { t, ago } from './i18n.js';
import { waterQuality } from './read.js';
import { FEATURE_KEYS, deviceName, deviceMeasure, measuresSalinity, adviceText } from './device.js';

const WIDGETS = { POOL: 'pool' };

const CHART_FEATURES = ['temperature', 'ph', 'orp', 'salinity', 'none'];
const CHART_INTERVALS = ['last-day', 'last-three-days', 'last-week', 'last-month'];
const DEFAULT_CHART = 'temperature';
const DEFAULT_INTERVAL = 'last-week';
const TTL = { min: 60, max: 3600, message: 300 };
const CHART_UNITS = { temperature: '°C', ph: 'pH', orp: 'mV', salinity: 'ppm' };
// Semantic colors of the levels (the ranges are Blue Riiot's, not ours).
const LEVEL_COLORS = { ok: 'success', warning: 'warning', critical: 'danger' };
// How the measure reached the cloud.
const ISSUERS = ['sigfox', 'ble', 'wifi', 'mobileapp', 'gateway', 'extender'];

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('No Blue Connect');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The settings of the widget, unknown values replaced by the defaults.
 * @param {object} [settings] - The raw settings.
 * @returns {{ chart: string, interval: string }} The settings.
 * @example
 * readPoolSettings({ chart: 'ph' }); // -> { chart: 'ph', interval: 'last-week' }
 */
function readPoolSettings(settings = {}) {
  return {
    chart: CHART_FEATURES.includes(settings.chart) ? settings.chart : DEFAULT_CHART,
    interval: CHART_INTERVALS.includes(settings.interval) ? settings.interval : DEFAULT_INTERVAL,
  };
}

const round = (value, digits) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : '–';

/**
 * @description The tile of a measure.
 * @param {object} device - The device snapshot.
 * @param {string} name - The measure.
 * @param {object} spec - `{ label, icon, unit?, digits, convert? }`.
 * @returns {object} The value component.
 */
function tile(device, name, { label, icon, unit, digits, convert = (value) => value }) {
  const measure = deviceMeasure(device, name);
  const value = typeof measure?.value === 'number' ? convert(measure.value) : null;
  return {
    type: 'value',
    value: round(value, digits),
    ...(unit ? { unit } : {}),
    label,
    icon,
    color: LEVEL_COLORS[measure?.level] ?? 'neutral',
  };
}

/**
 * @description What to say about the water, one or two sentences.
 * @param {object} device - The device snapshot.
 * @param {string} language - The language.
 * @param {number} now - Now, in ms.
 * @returns {string} The text.
 */
function advice(device, language, now) {
  if (device.stale) {
    return t('adviceStale', language, {
      hours: Math.floor((now - device.measuredAt) / 3600000),
    });
  }
  return adviceText(device.advice, 300) ?? t('adviceNone', language);
}

/**
 * @description The `pool` widget.
 * @param {object} options - Options.
 * @param {object} options.device - The device snapshot.
 * @param {string} options.language - The user language.
 * @param {string} [options.units] - `metric` or `imperial`.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollMinutes - The reading interval.
 * @param {object} [options.settings] - The widget settings (readPoolSettings).
 * @param {Function|null} [options.featureId] - `(key) => external id` of the
 * device features, null when the device is not created (no chart then: the
 * core has no history of it).
 * @returns {object} The content.
 * @example
 * buildPoolWidget({ device, language: 'fr', now: Date.now(), pollMinutes: 30 });
 */
function buildPoolWidget({
  device,
  language,
  units = 'metric',
  now,
  pollMinutes,
  settings = readPoolSettings(),
  featureId = null,
}) {
  const name = deviceName(device, language);
  const ttl = Math.min(TTL.max, Math.max(TTL.min, Math.round(pollMinutes * 60)));
  if (!Number.isFinite(device.measuredAt) && Object.keys(device.values ?? {}).length === 0) {
    return messageContent(`${name} · ${t('noMeasure', language)}`, ttl);
  }
  const imperial = units === 'imperial';
  const salinity = measuresSalinity(device);

  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        Number.isFinite(device.measuredAt)
          ? t('measuredAgo', language, { ago: ago(device.measuredAt, now, language), name })
          : name,
        80,
      ),
    },
    tile(device, 'temperature', {
      label: t('tileWater', language),
      icon: 'thermometer',
      unit: imperial ? '°F' : '°C',
      digits: 1,
      convert: imperial ? (value) => (value * 9) / 5 + 32 : undefined,
    }),
    tile(device, 'ph', { label: t('tilePh', language), icon: 'droplet', digits: 2 }),
    tile(device, 'orp', { label: t('tileOrp', language), icon: 'zap', unit: 'mV', digits: 0 }),
  ];
  if (salinity) {
    components.push(
      tile(device, 'salinity', {
        label: t('tileSalinity', language),
        icon: 'layers',
        unit: 'g/L',
        digits: 1,
      }),
    );
  }

  const chart = settings.chart === 'salinity' && !salinity ? 'none' : settings.chart;
  if (featureId && chart !== 'none') {
    components.push({
      type: 'chart',
      device_features: [featureId(FEATURE_KEYS[chart.toUpperCase()])],
      interval: settings.interval,
      chart_type: 'line',
      title: t(`chart_${chart}`, language),
      unit: CHART_UNITS[chart],
    });
  }

  components.push({
    type: 'text',
    variant: 'body',
    text: clip(advice(device, language, now), 300),
  });

  const rows = [];
  const quality = waterQuality(device.values);
  if (quality) {
    rows.push({
      label: t('rowQuality', language),
      value: t(`quality_${quality}`, language),
      color: LEVEL_COLORS[quality],
    });
  }
  if (typeof device.batteryLow === 'boolean') {
    rows.push({
      label: t('rowBattery', language),
      value: t(device.batteryLow ? 'batteryLow' : 'batteryOk', language),
      color: device.batteryLow ? 'danger' : 'success',
    });
  }
  const issuer =
    deviceMeasure(device, 'temperature')?.issuer ?? deviceMeasure(device, 'ph')?.issuer;
  if (issuer) {
    rows.push({
      label: t('rowSource', language),
      value: clip(ISSUERS.includes(issuer) ? t(`issuer_${issuer}`, language) : issuer, 40),
      color: 'neutral',
    });
  }
  if (rows.length > 0) {
    components.push({ type: 'status', items: rows });
  }

  return { ttl_seconds: ttl, components };
}

export {
  WIDGETS,
  CHART_FEATURES,
  CHART_INTERVALS,
  DEFAULT_CHART,
  DEFAULT_INTERVAL,
  LEVEL_COLORS,
  ISSUERS,
  clip,
  messageContent,
  readPoolSettings,
  advice,
  buildPoolWidget,
};
