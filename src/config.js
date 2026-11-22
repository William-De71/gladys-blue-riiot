// -----------------------------------------------------------------------------
// Configuration of the Blue Riiot integration.
//
// Fields of the config_schema:
//   - `email`          e-mail address of the Blue Connect account;
//   - `password`       its password (a `secret`: never sent back to the UI,
//                      never logged);
//   - `poll_interval`  how often the cloud is read, in minutes;
//   - `language`       language of the texts Gladys does not ask for in a
//                      language (feature names and texts, advice of the app,
//                      scene summaries): `auto` follows the language of the
//                      last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`  language of the last widget request, kept for the
//                      texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

// A Blue Connect measures every 20 minutes to a few hours depending on the
// model, the plan and how it reaches the cloud (Sigfox, Blue Extender, phone):
// reading every 30 minutes catches a measure soon enough, with about five
// requests per round.
const POLL_INTERVAL = { min: 10, max: 120, default: 30 };
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('45', POLL_INTERVAL); // -> 45
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ email: string, password: string, pollInterval: number, language: string }}
 * The config (poll interval in minutes, language 'auto' or a language code).
 * @example
 * normalizeConfig({ email: ' Me@Example.com ', password: 'x' }).email; // -> 'Me@Example.com'
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    // A pasted address often carries a space or a line break.
    email: typeof config.email === 'string' ? config.email.trim() : '',
    // A password is kept as typed: spaces may belong to it.
    password: typeof config.password === 'string' ? config.password : '',
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Whether an account is configured.
 * @param {object} config - A normalized config.
 * @returns {boolean} True with an e-mail and a password.
 */
const hasAccount = (config) => Boolean(config.email && config.password);

/**
 * @description A signature of the account, to see whether it changed.
 * @param {object} config - A normalized config.
 * @returns {string} The signature (kept in memory only).
 */
const accountSignature = (config) => JSON.stringify([config.email, config.password]);

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  POLL_INTERVAL,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeConfig,
  hasAccount,
  accountSignature,
  readLanguage,
};
