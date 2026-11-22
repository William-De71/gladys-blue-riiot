# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- **devices:** one device per Blue Connect of the Blue Riiot account, read through the cloud interface of the Blue Connect app with the e-mail and password of the account: water temperature, pH, redox (ORP), salinity on the models that measure it, water quality against the ideal ranges of Blue Riiot, advice of the app, battery low
- **scenes:** triggers on a new measure, a value out of its ideal range (warning or critical), a value back in range, a new advice, a low battery and measures that stop for 48 hours; scene actions to read a Blue Connect (test strips included) and to ask the Blue Extender for its newest measure
- **widget:** the pool water at a glance: temperature, pH, redox and salt tiles colored by the ideal ranges of Blue Riiot, a chart of one of them, the advice of the app, the water quality and the battery
- **configuration:** a "Test the account" button, a reading every 10 to 120 minutes (30 by default), the language of the texts; a refused login pauses the readings so the account is not locked
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-blue-riiot/releases/tag/v0.1.0
