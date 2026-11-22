// -----------------------------------------------------------------------------
// Answers of the Blue Riiot cloud -> plain snapshots (pure logic, no I/O).
//
// GET swimming_pool
//   { data: [ { swimming_pool_id, name, swimming_pool: { name, … } } ] }
// GET swimming_pool/{pool}/blue
//   { data: [ { blue_device_serial, swimming_pool_id, blue_device: {…} } ] }
// GET blue/{serial}
//   { serial, hw_product_name: "Blue Connect Go", hw_product_type,
//     fw_version_psoc, battery_low, last_measure_ble, last_measure_sigfox,
//     last_measure_wifi }
// GET swimming_pool/{pool}/blue/{serial}/lastMeasurements?mode=blue_and_strip
//   { last_blue_measure_timestamp, data: [ { name: "ph", value: 7.6,
//     timestamp, expired, ok_min, ok_max, warning_low, warning_high, trend,
//     issuer: "sigfox" | "ble" | "wifi" | "mobileapp" | "strip" | … } ] }
//   A name can come twice: the device value and a test strip value.
// GET swimming_pool/{pool}/feed?lang=fr
//   { data: [ { id: "SWP_OK", title: "Enjoy!", message: "Water quality…" } ] }
//
// Measure names: temperature (°C), ph, orp (mV), conductivity (µS/cm),
// salinity (g/L), salt (ppm), tds (ppm), and from test strips fcl, ccl, tcl
// (free, combined, total chlorine), ta (alkalinity), cya (cyanuric acid),
// cal (calcium hardness), all in mg/L.
//
// A value the cloud did not send is null, never 0. An id that could not be
// stable in an external id is left out.
// -----------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Levels of a measure, from the ranges Blue Riiot sends with it: inside
// [ok_min, ok_max] -> ok; outside but inside [warning_low, warning_high] ->
// warning; beyond -> critical.
const LEVELS = { OK: 'ok', WARNING: 'warning', CRITICAL: 'critical' };
const LEVEL_RANK = { ok: 0, warning: 1, critical: 2 };

// The measures the water quality is judged on (the temperature has a range
// too, but cold water in spring is not bad water).
const QUALITY_MEASURES = ['ph', 'orp', 'salinity'];

const finite = (value) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const instant = (value) => {
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? at : null;
};
const validId = (value) => {
  const id = text(value);
  return id && ID_PATTERN.test(id) ? id : null;
};
const list = (raw) => (Array.isArray(raw?.data) ? raw.data : []);

/**
 * @description The pools of the account.
 * @param {unknown} raw - The answer of GET swimming_pool.
 * @returns {Array<{ id: string, name: string|null }>} The pools.
 * @example
 * readPools({ data: [{ swimming_pool_id: 'abc', name: 'Garden' }] }); // -> [{ id: 'abc', name: 'Garden' }]
 */
function readPools(raw) {
  const pools = new Map();
  list(raw).forEach((item) => {
    const id = validId(item?.swimming_pool_id ?? item?.swimming_pool?.swimming_pool_id);
    if (id && !pools.has(id)) {
      pools.set(id, { id, name: text(item.swimming_pool?.name) ?? text(item.name) });
    }
  });
  return [...pools.values()];
}

/**
 * @description The serials of the Blue devices of a pool.
 * @param {unknown} raw - The answer of GET swimming_pool/{pool}/blue.
 * @returns {string[]} The serials.
 * @example
 * readPoolDevices({ data: [{ blue_device_serial: '0A1B2C3D' }] }); // -> ['0A1B2C3D']
 */
function readPoolDevices(raw) {
  const serials = list(raw)
    .map((item) => validId(item?.blue_device_serial ?? item?.blue_device?.serial))
    .filter(Boolean);
  return [...new Set(serials)];
}

/**
 * @description A Blue device.
 * @param {unknown} raw - The answer of GET blue/{serial}.
 * @returns {object} `{ productName, productType, firmware, batteryLow,
 * lastSeen }` (lastSeen: the newest message of any channel, in ms).
 * @example
 * readDevice({ hw_product_name: 'Blue Connect Go', battery_low: false });
 */
function readDevice(raw) {
  const device = raw && typeof raw === 'object' ? raw : {};
  const seen = ['last_measure_ble', 'last_measure_sigfox', 'last_measure_wifi']
    .map((key) => instant(device[key]))
    .filter((at) => at !== null);
  return {
    productName: text(device.hw_product_name),
    productType: text(device.hw_product_type),
    firmware: text(device.fw_version_psoc) ?? text(device.fw_version),
    batteryLow: typeof device.battery_low === 'boolean' ? device.battery_low : null,
    lastSeen: seen.length > 0 ? Math.max(...seen) : null,
  };
}

/**
 * @description The level of a value against the ranges Blue Riiot sent.
 * @param {number} value - The value.
 * @param {object} range - `{ okMin, okMax, warningLow, warningHigh }`.
 * @returns {string|null} ok, warning or critical; null without an ok range.
 * @example
 * levelOf(7.9, { okMin: 7.2, okMax: 7.6, warningLow: 6.6, warningHigh: 8.4 }); // -> 'warning'
 */
function levelOf(value, { okMin, okMax, warningLow, warningHigh }) {
  if (okMin === null && okMax === null) {
    return null;
  }
  if ((okMin === null || value >= okMin) && (okMax === null || value <= okMax)) {
    return LEVELS.OK;
  }
  const low = warningLow ?? -Infinity;
  const high = warningHigh ?? Infinity;
  // Without a warning band, a value out of the ok range is only a warning.
  if (warningLow === null && warningHigh === null) {
    return LEVELS.WARNING;
  }
  return value >= low && value <= high ? LEVELS.WARNING : LEVELS.CRITICAL;
}

/**
 * @description One measure of the answer.
 * @param {object} raw - An item of `data`.
 * @returns {object|null} The measure, null without a name or a value.
 */
function readMeasure(raw) {
  const name = text(raw?.name)?.toLowerCase();
  const value = finite(raw?.value);
  if (!name || value === null) {
    return null;
  }
  const range = {
    okMin: finite(raw.ok_min),
    okMax: finite(raw.ok_max),
    warningLow: finite(raw.warning_low),
    warningHigh: finite(raw.warning_high),
  };
  return {
    name,
    value,
    at: instant(raw.timestamp),
    expired: raw.expired === true,
    issuer: text(raw.issuer)?.toLowerCase() ?? null,
    trend: text(raw.trend)?.toLowerCase() ?? null,
    ...range,
    level: levelOf(value, range),
  };
}

/**
 * @description Whether a measure beats another one for the same name: not
 * expired first, then a device value over a test strip, then the newest.
 * @param {object} a - A measure.
 * @param {object} b - Another one.
 * @returns {boolean} True when `a` is better.
 */
function better(a, b) {
  if (a.expired !== b.expired) {
    return !a.expired;
  }
  const stripA = a.issuer === 'strip';
  const stripB = b.issuer === 'strip';
  if (stripA !== stripB) {
    return !stripA;
  }
  return (a.at ?? 0) > (b.at ?? 0);
}

/**
 * @description The last measures of a Blue device, the best one per name.
 * @param {unknown} raw - The answer of lastMeasurements.
 * @returns {{ measuredAt: number|null, values: object }} `values` by name;
 * `salinity` is filled from `salt` (ppm) when only that one came.
 * @example
 * readMeasurements({ data: [{ name: 'ph', value: 7.4 }] }).values.ph.value; // -> 7.4
 */
function readMeasurements(raw) {
  const values = {};
  list(raw).forEach((item) => {
    const measure = readMeasure(item);
    if (measure && (!values[measure.name] || better(measure, values[measure.name]))) {
      values[measure.name] = measure;
    }
  });
  if (!values.salinity && values.salt) {
    const { salt } = values;
    const toGrams = (ppm) => (ppm === null ? null : ppm / 1000);
    values.salinity = {
      ...salt,
      name: 'salinity',
      value: salt.value / 1000,
      okMin: toGrams(salt.okMin),
      okMax: toGrams(salt.okMax),
      warningLow: toGrams(salt.warningLow),
      warningHigh: toGrams(salt.warningHigh),
    };
  }
  const deviceTimes = Object.values(values)
    .filter((measure) => measure.issuer !== 'strip' && measure.at !== null)
    .map((measure) => measure.at);
  const measuredAt =
    instant(raw?.last_blue_measure_timestamp) ??
    (deviceTimes.length > 0 ? Math.max(...deviceTimes) : null);
  return { measuredAt, values };
}

/**
 * @description The advice of the app for a pool (the first item of the feed).
 * @param {unknown} raw - The answer of GET swimming_pool/{pool}/feed.
 * @returns {{ id: string, title: string|null, message: string|null }|null} The advice.
 * @example
 * readFeed({ data: [{ id: 'SWP_OK', title: 'Enjoy!', message: 'Water quality is at the top!' }] });
 */
function readFeed(raw) {
  const item = list(raw).find((entry) => text(entry?.id) || text(entry?.title));
  if (!item) {
    return null;
  }
  const title = text(item.title);
  const message = text(item.message);
  return { id: text(item.id) ?? title, title, message };
}

/**
 * @description The water quality of a device: the worst level of pH, redox
 * and salinity, from the device itself (test strips and expired values left
 * out).
 * @param {object} values - Measures by name.
 * @returns {string|null} ok, warning or critical; null when unknown.
 * @example
 * waterQuality({ ph: { level: 'ok' }, orp: { level: 'warning' } }); // -> 'warning'
 */
function waterQuality(values) {
  const levels = QUALITY_MEASURES.map((name) => values?.[name])
    .filter((measure) => measure && !measure.expired && measure.issuer !== 'strip')
    .map((measure) => measure.level)
    .filter((level) => level in LEVEL_RANK);
  if (levels.length === 0) {
    return null;
  }
  return levels.reduce((worst, level) => (LEVEL_RANK[level] > LEVEL_RANK[worst] ? level : worst));
}

export {
  ID_PATTERN,
  LEVELS,
  LEVEL_RANK,
  QUALITY_MEASURES,
  readPools,
  readPoolDevices,
  readDevice,
  levelOf,
  readMeasurements,
  readFeed,
  waterQuality,
};
