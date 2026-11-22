// -----------------------------------------------------------------------------
// Client of the Blue Riiot cloud (https://api.riiotlabs.com/prod/).
//
// Blue Riiot publishes no API: this is the interface of the Blue Connect app,
// as the community integrations use it (python-blueconnect, Apache-2.0; the
// openHAB binding and the Home Assistant integration of 2026). It may change
// without notice.
//
//   POST user/login  {email, password}  -> temporary AWS credentials
//        { credentials: { access_key, secret_key, session_token, expiration } }
//        a wrong account: 403 {"errorMessage":"Unauthorized: bad user or
//        password. (ERR_USE_00001)"} (seen on 2026-11-22)
//   then every request is signed with AWS SigV4 (sigv4.js, execute-api,
//   eu-west-1) and the session token:
//   GET  swimming_pool                                   pools of the account
//   GET  swimming_pool/{pool}/blue                       Blue devices of a pool
//   GET  blue/{serial}                                   one Blue device
//   GET  swimming_pool/{pool}/blue/{serial}/lastMeasurements?mode=blue_and_strip
//   GET  swimming_pool/{pool}/feed?lang={xx}             the advice of the app
//   POST blue/{serial}/releaseLastUnprocessedEvent       ask the Blue Extender
//                                                        for its newest measure
//
// The credentials last about an hour: they are renewed 2 minutes before they
// expire, and once more on a 401/403 (they may have been revoked).
//
// Every failure becomes a BlueRiiotError with a `kind` the app turns into a
// user message: auth (login refused: never retried on a timer, so the account
// is not locked), rate_limit, unreachable, unexpected. Neither the password
// nor a credential ever appears in an error message.
// -----------------------------------------------------------------------------

import { signRequest } from './sigv4.js';

const BASE_URL = 'https://api.riiotlabs.com/prod/';
const SCOPE = { region: 'eu-west-1', service: 'execute-api' };
const TIMEOUT_MS = 30000;
const REFRESH_MARGIN_MS = 120000;
// When the login answer has no usable expiration.
const FALLBACK_TTL_MS = 55 * 60000;

class BlueRiiotError extends Error {
  /**
   * @description An error of the Blue Riiot cloud.
   * @param {string} kind - auth, rate_limit, unreachable or unexpected.
   * @param {string} message - What failed (never a secret).
   * @param {object} [details] - `{ status, login }`: the HTTP status, and
   * whether the login itself was refused.
   */
  constructor(kind, message, { status, login = false } = {}) {
    super(message);
    this.name = 'BlueRiiotError';
    this.kind = kind;
    this.status = status;
    this.login = login;
  }
}

/**
 * @description The error kind of an HTTP status.
 * @param {number} status - The status.
 * @returns {string} The kind.
 * @example
 * kindOfStatus(429); // -> 'rate_limit'
 */
function kindOfStatus(status) {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  return status >= 500 ? 'unreachable' : 'unexpected';
}

/**
 * @description When the credentials expire, in ms.
 * @param {unknown} value - `credentials.expiration`: an ISO date, or seconds
 * or milliseconds since the epoch.
 * @returns {number|null} The instant, null when unreadable.
 * @example
 * parseExpiration('2026-11-22T11:00:00.000Z'); // -> 1795345200000
 */
function parseExpiration(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const instant = Date.parse(value);
    return Number.isFinite(instant) ? instant : null;
  }
  return null;
}

/**
 * @description A safe path segment (pool ids are UUIDs, serials hexadecimal).
 * @param {string} value - The id.
 * @returns {string} The encoded segment.
 */
const segment = (value) => encodeURIComponent(String(value));

/**
 * @description Create a Blue Riiot client.
 * @param {object} options - Options.
 * @param {Function} options.getAccount - `() => ({ email, password })`.
 * @param {Function} [options.fetch] - fetch implementation (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.userAgent] - User-Agent header.
 * @param {string} [options.baseUrl] - API root (tests).
 * @returns {object} The client.
 * @example
 * const blue = createBlueClient({ getAccount: () => ({ email, password }) });
 * const pools = await blue.listPools();
 */
function createBlueClient({
  getAccount,
  fetch = globalThis.fetch,
  now = () => Date.now(),
  userAgent = 'gladys-blue-riiot',
  baseUrl = BASE_URL,
}) {
  // { accessKey, secretKey, sessionToken, expiresAt, account }
  let session = null;

  /**
   * @description Send a request, network failures as BlueRiiotError.
   * @param {string} label - What is read, for the messages.
   * @param {string} url - The URL.
   * @param {object} init - fetch options.
   * @returns {Promise<Response>} The response.
   */
  async function send(label, url, init) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new BlueRiiotError(
        'unreachable',
        `Blue Riiot ${label}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`,
      );
    }
  }

  /**
   * @description Log in and keep the temporary credentials.
   * @returns {Promise<object>} The session.
   */
  async function login() {
    const { email = '', password = '' } = getAccount() ?? {};
    if (!email || !password) {
      throw new BlueRiiotError('auth', 'No Blue Riiot account is configured', { login: true });
    }
    const response = await send('login', `${baseUrl}user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      body: JSON.stringify({ email, password }),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new BlueRiiotError('auth', `Blue Riiot login refused: HTTP ${response.status}`, {
        status: response.status,
        login: true,
      });
    }
    if (!response.ok) {
      throw new BlueRiiotError(
        kindOfStatus(response.status),
        `Blue Riiot login: HTTP ${response.status}`,
        { status: response.status },
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new BlueRiiotError('unexpected', 'Blue Riiot login: the answer is not JSON');
    }
    const credentials = body?.credentials;
    if (
      typeof credentials?.access_key !== 'string' ||
      typeof credentials?.secret_key !== 'string' ||
      !credentials.access_key ||
      !credentials.secret_key
    ) {
      throw new BlueRiiotError('unexpected', 'Blue Riiot login: no credentials in the answer');
    }
    session = {
      accessKey: credentials.access_key,
      secretKey: credentials.secret_key,
      sessionToken:
        typeof credentials.session_token === 'string' ? credentials.session_token : undefined,
      expiresAt: parseExpiration(credentials.expiration) ?? now() + FALLBACK_TTL_MS,
      account: email,
    };
    return session;
  }

  /**
   * @description The current session, renewed when it nearly expired or when
   * the account changed.
   * @returns {Promise<object>} The session.
   */
  async function ensureSession() {
    const { email = '' } = getAccount() ?? {};
    if (!session || session.account !== email || now() >= session.expiresAt - REFRESH_MARGIN_MS) {
      return login();
    }
    return session;
  }

  /**
   * @description A signed request; logs in again once on a 401/403.
   * @param {string} method - GET or POST.
   * @param {string} path - Path and query, below the API root.
   * @param {string} label - What is read, for the messages.
   * @param {boolean} [retry] - Whether a refused request may log in again.
   * @returns {Promise<unknown>} The JSON answer (null for an empty body).
   */
  async function request(method, path, label, retry = true) {
    const { accessKey, secretKey, sessionToken } = await ensureSession();
    const url = `${baseUrl}${path}`;
    const signed = signRequest(
      { method, url },
      { accessKey, secretKey, sessionToken },
      SCOPE,
      new Date(now()),
    );
    const response = await send(label, url, {
      method,
      headers: { Accept: 'application/json', 'User-Agent': userAgent, ...signed },
    });
    if ((response.status === 401 || response.status === 403) && retry) {
      // Revoked or expired before their time: a fresh login, once.
      session = null;
      return request(method, path, label, false);
    }
    if (!response.ok) {
      throw new BlueRiiotError(
        kindOfStatus(response.status),
        `Blue Riiot ${label}: HTTP ${response.status}`,
        { status: response.status },
      );
    }
    const raw = await response.text();
    if (!raw.trim()) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new BlueRiiotError('unexpected', `Blue Riiot ${label}: the answer is not JSON`, {
        status: response.status,
      });
    }
  }

  return {
    /** @returns {Promise<unknown>} The pools of the account. */
    listPools: () => request('GET', 'swimming_pool', 'pools'),
    /**
     * @param {string} poolId - The pool.
     * @returns {Promise<unknown>} The Blue devices of a pool.
     */
    listPoolDevices: (poolId) =>
      request('GET', `swimming_pool/${segment(poolId)}/blue`, 'pool devices'),
    /**
     * @param {string} serial - The Blue device.
     * @returns {Promise<unknown>} The device.
     */
    getDevice: (serial) => request('GET', `blue/${segment(serial)}`, 'device'),
    /**
     * @param {string} poolId - The pool.
     * @param {string} serial - The Blue device.
     * @returns {Promise<unknown>} The last measures, device and test strips.
     */
    lastMeasurements: (poolId, serial) =>
      request(
        'GET',
        `swimming_pool/${segment(poolId)}/blue/${segment(serial)}/lastMeasurements?mode=blue_and_strip`,
        'measurements',
      ),
    /**
     * @param {string} poolId - The pool.
     * @param {string} language - en, fr, de, es…
     * @returns {Promise<unknown>} The advice of the app.
     */
    poolFeed: (poolId, language) =>
      request('GET', `swimming_pool/${segment(poolId)}/feed?lang=${segment(language)}`, 'advice'),
    /**
     * @param {string} serial - The Blue device.
     * @returns {Promise<unknown>} The answer of the cloud.
     */
    releaseLastMeasure: (serial) =>
      request('POST', `blue/${segment(serial)}/releaseLastUnprocessedEvent`, 'extender'),
    /** @description Forget the session: the next request logs in again. */
    logout: () => {
      session = null;
    },
  };
}

export { BASE_URL, SCOPE, BlueRiiotError, kindOfStatus, parseExpiration, createBlueClient };
