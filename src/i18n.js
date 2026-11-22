// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface:
// appareil / Gerät / dispositivo, scène / Szene / escena.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  deviceName: {
    en: '{product} {pool}',
    fr: '{product} {pool}',
    de: '{product} {pool}',
    es: '{product} {pool}',
  },
  defaultPool: { en: 'pool', fr: 'piscine', de: 'Pool', es: 'piscina' },
  featureTemperature: {
    en: 'Water temperature',
    fr: 'Température de l’eau',
    de: 'Wassertemperatur',
    es: 'Temperatura del agua',
  },
  featurePh: { en: 'pH', fr: 'pH', de: 'pH-Wert', es: 'pH' },
  featureOrp: { en: 'Redox (ORP)', fr: 'Redox (ORP)', de: 'Redox (ORP)', es: 'Redox (ORP)' },
  featureSalinity: { en: 'Salinity', fr: 'Salinité', de: 'Salzgehalt', es: 'Salinidad' },
  featureWaterQuality: {
    en: 'Water quality',
    fr: 'Qualité de l’eau',
    de: 'Wasserqualität',
    es: 'Calidad del agua',
  },
  featureAdvice: {
    en: 'Blue Riiot advice',
    fr: 'Conseil Blue Riiot',
    de: 'Blue-Riiot-Hinweis',
    es: 'Consejo de Blue Riiot',
  },
  featureBatteryLow: {
    en: 'Battery low',
    fr: 'Batterie faible',
    de: 'Batterie schwach',
    es: 'Batería baja',
  },

  // water quality levels (the ideal ranges are the ones of Blue Riiot)
  quality_ok: { en: 'Good', fr: 'Bonne', de: 'Gut', es: 'Buena' },
  quality_warning: {
    en: 'To watch',
    fr: 'À surveiller',
    de: 'Im Auge behalten',
    es: 'A vigilar',
  },
  quality_critical: {
    en: 'Out of range',
    fr: 'Hors plage',
    de: 'Außerhalb des Bereichs',
    es: 'Fuera de rango',
  },

  // measure names, in sentences
  measure_temperature: { en: 'water', fr: 'eau', de: 'Wasser', es: 'agua' },
  measure_ph: { en: 'pH', fr: 'pH', de: 'pH', es: 'pH' },
  measure_orp: { en: 'redox', fr: 'redox', de: 'Redox', es: 'redox' },
  measure_salinity: { en: 'salinity', fr: 'salinité', de: 'Salzgehalt', es: 'salinidad' },

  // widget
  tileWater: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
  tilePh: { en: 'pH', fr: 'pH', de: 'pH', es: 'pH' },
  tileOrp: { en: 'Redox', fr: 'Redox', de: 'Redox', es: 'Redox' },
  tileSalinity: { en: 'Salt', fr: 'Sel', de: 'Salz', es: 'Sal' },
  chart_temperature: {
    en: 'Water temperature',
    fr: 'Température de l’eau',
    de: 'Wassertemperatur',
    es: 'Temperatura del agua',
  },
  chart_ph: { en: 'pH', fr: 'pH', de: 'pH-Wert', es: 'pH' },
  chart_orp: { en: 'Redox (ORP)', fr: 'Redox (ORP)', de: 'Redox (ORP)', es: 'Redox (ORP)' },
  chart_salinity: {
    en: 'Salinity (ppm)',
    fr: 'Salinité (ppm)',
    de: 'Salzgehalt (ppm)',
    es: 'Salinidad (ppm)',
  },
  measuredAgo: {
    en: 'Measured {ago} · {name}',
    fr: 'Mesuré {ago} · {name}',
    de: 'Gemessen {ago} · {name}',
    es: 'Medido {ago} · {name}',
  },
  rowQuality: { en: 'Water quality', fr: 'Qualité de l’eau', de: 'Wasserqualität', es: 'Calidad' },
  rowBattery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  rowSource: { en: 'Sent by', fr: 'Envoyée par', de: 'Gesendet über', es: 'Enviada por' },
  batteryOk: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  batteryLow: { en: 'Low', fr: 'Faible', de: 'Schwach', es: 'Baja' },
  issuer_sigfox: { en: 'Sigfox', fr: 'Sigfox', de: 'Sigfox', es: 'Sigfox' },
  issuer_ble: { en: 'Bluetooth', fr: 'Bluetooth', de: 'Bluetooth', es: 'Bluetooth' },
  issuer_wifi: { en: 'Wi-Fi', fr: 'Wi-Fi', de: 'WLAN', es: 'wifi' },
  issuer_mobileapp: {
    en: 'Phone app',
    fr: 'Application mobile',
    de: 'Handy-App',
    es: 'Aplicación móvil',
  },
  issuer_gateway: { en: 'Gateway', fr: 'Passerelle', de: 'Gateway', es: 'Pasarela' },
  issuer_extender: {
    en: 'Blue Extender',
    fr: 'Blue Extender',
    de: 'Blue Extender',
    es: 'Blue Extender',
  },
  adviceNone: {
    en: 'No advice from the Blue Connect app for now.',
    fr: 'Aucun conseil de l’application Blue Connect pour le moment.',
    de: 'Zurzeit kein Hinweis der Blue-Connect-App.',
    es: 'Ningún consejo de la aplicación Blue Connect por ahora.',
  },
  adviceStale: {
    en: 'No measure for {hours} h: check the battery of the Blue Connect and how it reaches the cloud (Sigfox, Blue Extender or phone).',
    fr: 'Aucune mesure depuis {hours} h : vérifiez la batterie du Blue Connect et sa liaison au cloud (Sigfox, Blue Extender ou téléphone).',
    de: 'Seit {hours} h keine Messung: Prüfen Sie die Batterie des Blue Connect und seine Verbindung zur Cloud (Sigfox, Blue Extender oder Handy).',
    es: 'Sin medida desde hace {hours} h: revise la batería del Blue Connect y su conexión a la nube (Sigfox, Blue Extender o teléfono).',
  },
  noAccount: {
    en: 'Enter the e-mail and password of your Blue Connect account in the configuration.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte Blue Connect dans la configuration.',
    de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres Blue-Connect-Kontos in der Konfiguration ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta Blue Connect en la configuración.',
  },
  notReadYet: {
    en: 'Reading Blue Riiot…',
    fr: 'Lecture de Blue Riiot…',
    de: 'Blue Riiot wird gelesen…',
    es: 'Leyendo Blue Riiot…',
  },
  noDevice: {
    en: 'No Blue Connect in this account.',
    fr: 'Aucun Blue Connect dans ce compte.',
    de: 'Kein Blue Connect in diesem Konto.',
    es: 'Ningún Blue Connect en esta cuenta.',
  },
  noMeasure: {
    en: 'no measure yet.',
    fr: 'pas encore de mesure.',
    de: 'noch keine Messung.',
    es: 'aún sin medida.',
  },

  // relative times
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },

  // scene summaries and action results
  summaryMeasure: {
    en: '{name}: {values}.',
    fr: '{name} : {values}.',
    de: '{name}: {values}.',
    es: '{name}: {values}.',
  },
  summaryOut_warning: {
    en: '{name}: {value}, outside the ideal range ({min} to {max}).',
    fr: '{name} : {value}, hors de la plage idéale ({min} à {max}).',
    de: '{name}: {value}, außerhalb des Idealbereichs ({min} bis {max}).',
    es: '{name}: {value}, fuera del rango ideal ({min} a {max}).',
  },
  summaryOut_critical: {
    en: '{name}: {value}, far outside the ideal range ({min} to {max}).',
    fr: '{name} : {value}, très en dehors de la plage idéale ({min} à {max}).',
    de: '{name}: {value}, weit außerhalb des Idealbereichs ({min} bis {max}).',
    es: '{name}: {value}, muy fuera del rango ideal ({min} a {max}).',
  },
  summaryBack: {
    en: '{name}: {value}, back in the ideal range ({min} to {max}).',
    fr: '{name} : {value}, de retour dans la plage idéale ({min} à {max}).',
    de: '{name}: {value}, wieder im Idealbereich ({min} bis {max}).',
    es: '{name}: {value}, de nuevo en el rango ideal ({min} a {max}).',
  },
  summaryAdvice: {
    en: '{name}: {advice}',
    fr: '{name} : {advice}',
    de: '{name}: {advice}',
    es: '{name}: {advice}',
  },
  summaryBattery: {
    en: '{name}: the battery is low.',
    fr: '{name} : la batterie est faible.',
    de: '{name}: Die Batterie ist schwach.',
    es: '{name}: la batería está baja.',
  },
  summaryStopped: {
    en: '{name}: no measure for {hours} h.',
    fr: '{name} : aucune mesure depuis {hours} h.',
    de: '{name}: seit {hours} h keine Messung.',
    es: '{name}: sin medida desde hace {hours} h.',
  },
  fetchRequested: {
    en: 'The Blue Extender was asked for its newest measure: it arrives with the next reading.',
    fr: 'Le Blue Extender a été sollicité pour sa dernière mesure : elle arrivera à la prochaine lecture.',
    de: 'Der Blue Extender wurde um seine neueste Messung gebeten: Sie kommt beim nächsten Lesen.',
    es: 'Se ha pedido al Blue Extender su última medida: llegará con la próxima lectura.',
  },
  fetchTooSoon: {
    en: 'The Blue Extender was already asked less than 10 minutes ago.',
    fr: 'Le Blue Extender a déjà été sollicité il y a moins de 10 minutes.',
    de: 'Der Blue Extender wurde schon vor weniger als 10 Minuten gefragt.',
    es: 'Ya se pidió al Blue Extender hace menos de 10 minutos.',
  },

  // connection status and Configuration screen
  statusConnected: {
    en: 'Connected to Blue Riiot: {devices} Blue Connect.',
    fr: 'Connecté à Blue Riiot : {devices} Blue Connect.',
    de: 'Mit Blue Riiot verbunden: {devices} Blue Connect.',
    es: 'Conectado a Blue Riiot: {devices} Blue Connect.',
  },
  statusNoPool: {
    en: 'Connected, but this Blue Connect account has no pool.',
    fr: 'Connecté, mais ce compte Blue Connect n’a aucune piscine.',
    de: 'Verbunden, aber dieses Blue-Connect-Konto hat keinen Pool.',
    es: 'Conectado, pero esta cuenta Blue Connect no tiene ninguna piscina.',
  },
  statusNoDevice: {
    en: 'Connected, but no Blue Connect is paired with the pools of this account.',
    fr: 'Connecté, mais aucun Blue Connect n’est associé aux piscines de ce compte.',
    de: 'Verbunden, aber kein Blue Connect ist mit den Pools dieses Kontos gekoppelt.',
    es: 'Conectado, pero ningún Blue Connect está asociado a las piscinas de esta cuenta.',
  },
  statusLoginRefused: {
    en: 'Blue Riiot refused the e-mail or password. Readings are paused so the account is not locked: correct them and save.',
    fr: 'Blue Riiot a refusé l’e-mail ou le mot de passe. Les lectures sont en pause pour ne pas bloquer le compte : corrigez-les et enregistrez.',
    de: 'Blue Riiot hat E-Mail oder Passwort abgelehnt. Das Lesen ist pausiert, damit das Konto nicht gesperrt wird: Korrigieren und speichern Sie.',
    es: 'Blue Riiot rechazó el correo o la contraseña. Las lecturas están en pausa para no bloquear la cuenta: corríjalos y guarde.',
  },
  statusNotAllowed: {
    en: 'Blue Riiot refused a request of this account: new try at the next reading.',
    fr: 'Blue Riiot a refusé une requête de ce compte : nouvel essai à la prochaine lecture.',
    de: 'Blue Riiot hat eine Anfrage dieses Kontos abgelehnt: neuer Versuch beim nächsten Lesen.',
    es: 'Blue Riiot rechazó una petición de esta cuenta: nuevo intento en la próxima lectura.',
  },
  statusRateLimited: {
    en: 'Blue Riiot limits the requests for now: new try at the next reading.',
    fr: 'Blue Riiot limite les requêtes pour le moment : nouvel essai à la prochaine lecture.',
    de: 'Blue Riiot begrenzt die Anfragen gerade: neuer Versuch beim nächsten Lesen.',
    es: 'Blue Riiot limita las peticiones por ahora: nuevo intento en la próxima lectura.',
  },
  statusUnexpected: {
    en: 'Blue Riiot sent an unexpected answer: the app interface may have changed. New try at the next reading.',
    fr: 'Blue Riiot a envoyé une réponse inattendue : l’interface de l’application a peut-être changé. Nouvel essai à la prochaine lecture.',
    de: 'Blue Riiot hat eine unerwartete Antwort gesendet: Die Schnittstelle der App hat sich vielleicht geändert. Neuer Versuch beim nächsten Lesen.',
    es: 'Blue Riiot envió una respuesta inesperada: puede que la interfaz de la aplicación haya cambiado. Nuevo intento en la próxima lectura.',
  },
  statusUnreachable: {
    en: 'The Blue Riiot cloud does not answer: new try at the next reading.',
    fr: 'Le cloud Blue Riiot ne répond pas : nouvel essai à la prochaine lecture.',
    de: 'Die Blue-Riiot-Cloud antwortet nicht: neuer Versuch beim nächsten Lesen.',
    es: 'La nube de Blue Riiot no responde: nuevo intento en la próxima lectura.',
  },
  testOk: {
    en: 'Account accepted: {pools} pool(s), {devices} Blue Connect.',
    fr: 'Compte accepté : {pools} piscine(s), {devices} Blue Connect.',
    de: 'Konto akzeptiert: {pools} Pool(s), {devices} Blue Connect.',
    es: 'Cuenta aceptada: {pools} piscina(s), {devices} Blue Connect.',
  },
};

/**
 * @description Whether a value is one of the supported languages.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de or es.
 * @example
 * isLanguage('fr'); // -> true
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('deviceName', 'fr', { product: 'Blue Connect Go', pool: 'Jardin' }); // -> 'Blue Connect Go Jardin'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('statusConnected', { pools: 1 });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("7,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(7.25, 'fr', 1); // -> '7,3'
 */
function formatNumber(value, language, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
