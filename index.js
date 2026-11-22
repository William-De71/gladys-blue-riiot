// -----------------------------------------------------------------------------
// Entry point of the Blue Riiot external integration.
//
// Brings the Blue Connect pool analysers of a Blue Riiot account into Gladys:
//   - a device per Blue Connect (water temperature, pH, redox, salinity on the
//     models that measure it, water quality, advice of the app, battery low),
//     offered on the Discovery screen (see src/device.js);
//   - scene triggers: new measure, a value out of its ideal range or back in
//     it, a new advice, battery low, measures stopped;
//   - scene actions: read a Blue Connect; ask the Blue Extender for its newest
//     measure;
//   - a dashboard widget: the pool water at a glance.
//
// Blue Riiot has no local API and no public one: the integration uses the
// cloud interface of the Blue Connect app, with the account of the app.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Blue Riiot integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
