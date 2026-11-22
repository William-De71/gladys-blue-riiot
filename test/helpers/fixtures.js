// Shapes of the Blue Riiot cloud answers (as recorded by python-blueconnect,
// the openHAB binding and the Home Assistant integration of 2026), a fake
// Blue Riiot cloud and a stand-in for the SDK external ids.

export const NOW = Date.parse('2026-07-14T10:00:00Z');
export const HOUR = 3600000;

export const POOL_ID = '20d3be3a-6627-4cba-9939-40fb13d0d1db';
export const SPA_ID = '31e4cf4b-7738-4dcb-aa4a-51ac24e1e2ec';
export const SERIAL = '0A1B2C3D';
export const SPA_SERIAL = '0E1F2A3B';
export const EMAIL = 'me@example.com';
export const PASSWORD = 'p4ss word';

// The ideal ranges Blue Riiot sends with each measure.
export const RANGES = {
  temperature: { ok_min: 20, ok_max: 40, warning_low: 5, warning_high: 50 },
  ph: { ok_min: 7.2, ok_max: 7.6, warning_low: 6.6, warning_high: 8.4 },
  orp: { ok_min: 650, ok_max: 750, warning_low: 400, warning_high: 900 },
  salinity: { ok_min: 2.7, ok_max: 3.4, warning_low: 2, warning_high: 4.5 },
  ta: { ok_min: 80, ok_max: 120 },
  fcl: { ok_min: 1, ok_max: 3 },
};

/**
 * @description The answer of lastMeasurements.
 * @param {object} [options] - Values; null leaves a measure out.
 * @returns {object} The answer.
 */
export function rawMeasures({
  at = NOW - HOUR,
  temperature = 26.43,
  ph = 7.418,
  orp = 702,
  salinity = null,
  issuer = 'sigfox',
  strips = true,
} = {}) {
  const timestamp = new Date(at).toISOString();
  const data = [];
  const add = (name, value) =>
    value !== null &&
    data.push({
      name,
      value,
      timestamp,
      expired: false,
      trend: 'stable',
      issuer,
      ...RANGES[name],
    });
  add('temperature', temperature);
  add('ph', ph);
  add('orp', orp);
  add('salinity', salinity);
  if (strips) {
    // Test strips entered by hand weeks ago: expired, never the device value.
    const old = new Date(NOW - 40 * 24 * HOUR).toISOString();
    data.push({
      name: 'ph',
      value: 6.7,
      timestamp: old,
      expired: true,
      issuer: 'strip',
      ...RANGES.ph,
    });
    data.push({
      name: 'ta',
      value: 90,
      timestamp: old,
      expired: true,
      issuer: 'strip',
      ...RANGES.ta,
    });
    data.push({
      name: 'fcl',
      value: 1.5,
      timestamp: old,
      expired: true,
      issuer: 'strip',
      ...RANGES.fcl,
    });
  }
  return { status: 'OK', last_blue_measure_timestamp: timestamp, data };
}

/**
 * @description The answer of GET blue/{serial}.
 * @param {object} [options] - Overrides.
 * @returns {object} The device.
 */
export function rawDevice({
  serial = SERIAL,
  product = 'Blue Connect Go',
  batteryLow = false,
  at = NOW - HOUR,
} = {}) {
  return {
    serial,
    hw_generation: 2,
    hw_product_type: 'go',
    hw_product_name: product,
    fw_version_psoc: '2.3.0',
    battery_low: batteryLow,
    last_measure_ble: new Date(at - 2 * HOUR).toISOString(),
    last_measure_sigfox: new Date(at).toISOString(),
  };
}

const FEEDS = {
  SWP_OK: {
    en: ['Enjoy!', 'Water quality is at the top!'],
    fr: ['Profitez !', 'La qualité de l’eau est au top !'],
  },
  SWP_PH_HIGH: {
    en: ['pH too high', 'Add pH minus to bring the pH back down.'],
    fr: ['pH trop élevé', 'Ajoutez du pH moins pour faire baisser le pH.'],
  },
};

/**
 * @description A fake Blue Riiot cloud: a fetch answering like
 * api.riiotlabs.com from an editable state. It checks the login and that every
 * other request is signed with the credentials it gave (not the signature
 * itself: test/sigv4.test.js compares it with botocore). Records every call
 * in `fetch.calls`.
 * @param {object} [state] - Overrides of the state.
 * @returns {Function} The fetch, with `.state` and `.calls`.
 */
export function blueCloud(state = {}) {
  const cloud = {
    email: EMAIL,
    password: PASSWORD,
    pools: [{ id: POOL_ID, name: 'Garden', devices: [SERIAL] }],
    devices: { [SERIAL]: { info: rawDevice(), measures: rawMeasures() } },
    feeds: { [POOL_ID]: 'SWP_OK' },
    failure: null,
    logins: 0,
    // The credentials the cloud accepts (revoked ones are removed).
    tokens: new Set(),
    expiresIn: HOUR,
    now: () => NOW,
    ...state,
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetch = async (url, init = {}) => {
    const target = new URL(url);
    const path = target.pathname.replace(/^\/prod\//, '');
    const method = init.method ?? 'GET';
    fetch.calls.push({ method, path, query: target.search, headers: init.headers });
    if (cloud.failure === 'network') {
      throw new TypeError('fetch failed');
    }
    if (typeof cloud.failure === 'number') {
      return json({ message: 'failure' }, cloud.failure);
    }
    if (path === 'user/login' && method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.email !== cloud.email || body.password !== cloud.password) {
        return json(
          {
            errorType: 'string',
            errorMessage: 'Unauthorized: bad user or password. (ERR_USE_00001)',
            trace: [],
          },
          403,
        );
      }
      cloud.logins += 1;
      const token = `session-${cloud.logins}`;
      cloud.tokens.add(token);
      return json({
        identity_id: 'eu-west-1:00000000-0000-0000-0000-000000000000',
        token: 't',
        credentials: {
          access_key: `ASIA${cloud.logins}`,
          secret_key: 'secret',
          session_token: token,
          expiration: new Date(cloud.now() + cloud.expiresIn).toISOString(),
        },
      });
    }
    const headers = init.headers ?? {};
    if (
      !String(headers.Authorization ?? '').startsWith('AWS4-HMAC-SHA256 Credential=ASIA') ||
      !cloud.tokens.has(headers['X-Amz-Security-Token'])
    ) {
      return json({ message: 'The security token included in the request is expired' }, 403);
    }
    let match;
    if (path === 'swimming_pool') {
      return json({
        data: cloud.pools.map((pool) => ({
          swimming_pool_id: pool.id,
          name: pool.name,
          role: 'FIRST_ADMINISTRATOR',
          swimming_pool: { swimming_pool_id: pool.id, name: pool.name },
        })),
      });
    }
    if ((match = /^swimming_pool\/([^/]+)\/blue$/.exec(path))) {
      const pool = cloud.pools.find((item) => item.id === match[1]);
      return json({
        data: (pool?.devices ?? []).map((serial) => ({
          blue_device_serial: serial,
          swimming_pool_id: pool.id,
        })),
      });
    }
    if ((match = /^swimming_pool\/([^/]+)\/feed$/.exec(path))) {
      const lang = target.searchParams.get('lang') === 'fr' ? 'fr' : 'en';
      const id = cloud.feeds[match[1]];
      if (cloud.failure === 'feed') {
        return json({ message: 'failure' }, 500);
      }
      if (!id) {
        return json({ data: [] });
      }
      const [title, message] = FEEDS[id][lang];
      return json({ swimming_pool_id: match[1], data: [{ id, title, message }], lang });
    }
    if ((match = /^swimming_pool\/([^/]+)\/blue\/([^/]+)\/lastMeasurements$/.exec(path))) {
      return json(cloud.devices[match[2]]?.measures ?? { data: [] });
    }
    if ((match = /^blue\/([^/]+)\/releaseLastUnprocessedEvent$/.exec(path)) && method === 'POST') {
      return json({ message: 'Last unprocessed event released' });
    }
    if ((match = /^blue\/([^/]+)$/.exec(path))) {
      const device = cloud.devices[match[1]];
      return device ? json(device.info) : json({ message: 'Not found' }, 404);
    }
    return json({ message: 'Missing Authentication Token' }, 403);
  };
  fetch.calls = [];
  fetch.state = cloud;
  return fetch;
}

// The SDK external ids, without a client (selector `blue-riiot`).
export const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:blue-riiot:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export const silent = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/**
 * @description A device snapshot, as the watcher keeps it.
 * @param {object} [options] - `{ measures, device, advice, poolName, serial }`:
 * options of rawMeasures and rawDevice, and the advice.
 * @param {Function} readMeasurements - From src/read.js.
 * @param {Function} readDevice - From src/read.js.
 * @returns {object} The snapshot.
 */
export function deviceSnapshot(
  { measures = {}, device = {}, advice, poolName = 'Garden', serial = SERIAL } = {},
  readMeasurements,
  readDevice,
) {
  const { measuredAt, values } = readMeasurements(rawMeasures(measures));
  return {
    serial,
    poolId: POOL_ID,
    poolName,
    ...readDevice(rawDevice({ serial, ...device })),
    measuredAt,
    values,
    advice:
      advice === undefined
        ? { id: 'SWP_OK', title: 'Enjoy!', message: 'Water quality is at the top!' }
        : advice,
    stale: false,
  };
}
