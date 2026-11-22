// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Two "Pool water" cards on a made-up summer week (fixed date, seeded
// randomness): a Blue Connect Go in a balanced pool, and a Blue Connect Plus
// in a salt pool whose pH drifted up while the redox fell. The advice texts
// stand in for the ones the Blue Connect app writes in each language.
// The chart of a card reads the history Gladys keeps for the feature: here
// the history is made up, the content around it is the real one.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildPoolWidget, readPoolSettings } = await load('src/widgets.js');
const { idsOf } = await load('src/device.js');
const { readMeasurements } = await load('src/read.js');
const { LANGUAGES, t } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Tuesday 14 July 2026, 18:00 in Paris.
const NOW = Date.parse('2026-07-14T16:00:00Z');
const HOUR = 3600000;
const gladys = {
  externalIds: (type, id) => {
    const device = `ext:blue-riiot:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

// mulberry32: the same "random" history on every run.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// One point an hour over the last 7 days.
function history(seed, value) {
  const next = random(seed);
  const points = [];
  for (let h = 7 * 24; h >= 0; h -= 1) {
    const at = NOW - h * HOUR;
    points.push({ t: new Date(at).toISOString(), v: Math.round(value(at, next) * 100) / 100 });
  }
  return points;
}
// Water warms in the afternoon (peak around 17:00 in Paris, 15:00 UTC).
const daily = (at) => Math.sin(((new Date(at).getUTCHours() - 9) / 24) * 2 * Math.PI);

// A lastMeasurements answer of the cloud, with the ranges Blue Riiot sends.
const RANGES = {
  temperature: { ok_min: 20, ok_max: 40, warning_low: 5, warning_high: 50 },
  ph: { ok_min: 7.2, ok_max: 7.6, warning_low: 6.6, warning_high: 8.4 },
  orp: { ok_min: 650, ok_max: 750, warning_low: 400, warning_high: 900 },
  salinity: { ok_min: 2.7, ok_max: 3.4, warning_low: 2, warning_high: 4.5 },
};
const measures = (at, values, issuer) =>
  readMeasurements({
    last_blue_measure_timestamp: new Date(at).toISOString(),
    data: Object.entries(values).map(([name, value]) => ({
      name,
      value,
      timestamp: new Date(at).toISOString(),
      expired: false,
      issuer,
      ...RANGES[name],
    })),
  });

const ADVICE = {
  balanced: {
    id: 'SWP_OK',
    en: ['Enjoy!', 'Water quality is at the top!'],
    fr: ['Profitez !', 'La qualité de l’eau est au top !'],
    de: ['Viel Spaß!', 'Die Wasserqualität ist top!'],
    es: ['¡Disfrute!', '¡La calidad del agua es excelente!'],
  },
  alert: {
    id: 'SWP_PH_HIGH',
    en: ['pH too high', 'Add pH minus, then check the chlorine production.'],
    fr: ['pH trop élevé', 'Ajoutez du pH moins, puis vérifiez la production de chlore.'],
    de: ['pH-Wert zu hoch', 'pH-Minus zugeben, dann die Chlorproduktion prüfen.'],
    es: ['pH demasiado alto', 'Añada pH minus y revise la producción de cloro.'],
  },
};

const CARDS = {
  balanced: {
    device: {
      serial: '0A1B2C3D',
      poolId: '20d3be3a-6627-4cba-9939-40fb13d0d1db',
      poolName: 'Garden',
      productName: 'Blue Connect Go',
      batteryLow: false,
      stale: false,
      ...measures(NOW - 42 * 60000, { temperature: 27.3, ph: 7.34, orp: 712 }, 'sigfox'),
    },
    advice: ADVICE.balanced,
    settings: { chart: 'temperature', interval: 'last-week' },
    feature: 'featureTemperature',
    history: history(
      7,
      (at, next) => 26 + 1.2 * daily(at) + ((at - NOW) / (7 * 24 * HOUR)) * -1.5 + next() * 0.2,
    ),
  },
  alert: {
    device: {
      serial: '0E1F2A3B',
      poolId: '31e4cf4b-7738-4dcb-aa4a-51ac24e1e2ec',
      poolName: 'Terrace',
      productName: 'Blue Connect Plus',
      batteryLow: false,
      stale: false,
      ...measures(NOW - 2 * HOUR, { temperature: 29.1, ph: 7.92, orp: 588, salinity: 3.1 }, 'wifi'),
    },
    advice: ADVICE.alert,
    settings: { chart: 'ph', interval: 'last-week' },
    feature: 'featurePh',
    history: history(11, (at, next) => 7.9 - 0.6 * ((NOW - at) / (7 * 24 * HOUR)) + next() * 0.05),
  },
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {};
  for (const [name, card] of Object.entries(CARDS)) {
    const [title, message] = card.advice[language];
    const content = buildPoolWidget({
      device: { ...card.device, advice: { id: card.advice.id, title, message } },
      language,
      now: NOW,
      pollMinutes: 30,
      settings: readPoolSettings(card.settings),
      featureId: idsOf(gladys, card.device.serial).feature,
    });
    // The front reads the history of a device-bound chart from Gladys, and
    // names the series after the feature.
    content.components = content.components.map((component) =>
      component.type === 'chart'
        ? { ...component, series: [{ name: t(card.feature, language), points: card.history }] }
        : component,
    );
    contents[language][name] = content;
  }
}
const widget = manifest.widgets.find((w) => w.key === 'pool');
writeFileSync(
  out,
  JSON.stringify({ now: NOW, card: { icon: widget.icon, label: widget.label }, contents }),
);
