# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the Blue Riiot Blue Connect
pool analysers: a Node.js service (Node 22+, ESM, no build step) that runs in
its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. Blue Riiot has no local API and no public one:
the integration uses the cloud interface of the Blue Connect app
(`https://api.riiotlabs.com/prod/`, described by python-blueconnect,
Apache-2.0): `POST user/login` with the e-mail and password of the account
returns temporary AWS credentials, then every request is signed with AWS SigV4
(`execute-api`, `eu-west-1`, `src/sigv4.js` on node:crypto, checked against
botocore). Every 30 minutes by default; about five requests per reading.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect()
src/sigv4.js            AWS Signature Version 4 (node:crypto only)
src/blue-api.js         Blue Riiot client: login, session renewal, error kinds
src/read.js             API answers -> plain snapshots (null, never 0, when unknown)
src/watcher.js          the timer loop: pools, devices, measures, advice
src/tracker.js          snapshots -> scene trigger transitions (pure logic)
src/events.js           scene trigger payloads and scene action outputs
src/device.js           one device per Blue Connect, its states
src/widgets.js          the "pool" dashboard widget
src/config.js           configuration (e-mail, password, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (built on the serial of the Blue device, never on a
  name), feature `category` / `type` / `unit` / `min` / `max` / `step`, the
  measure and level option values of the triggers, the keys of
  `config_schema`, `actions`, the widget and its settings, scene triggers
  (fields, options, variables) and scene actions (fields, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Salinity** is `level-sensor` / `decimal` in ppm (Blue Riiot sends g/L,
  Gladys has no g/L unit; `ppt` means parts per trillion in Gladys): the
  widget shows g/L. The feature only exists on devices that measure salinity.
  "Water quality" and "advice" are `text` / `text`; "battery low" is
  `battery-low` / `binary`. Do not change them without a migration.
- **The ranges are Blue Riiot's**: tile colors and the water quality come from
  the `ok_min` / `ok_max` / `warning_low` / `warning_high` of each measure,
  never from thresholds of ours. Test strips and expired values never feed a
  feature, a level or a range event; the scene action gives strips as they are.
- **A refused login is never retried on a timer** (it could lock the
  account): the readings pause until the configuration is saved or "Test the
  account" succeeds. A 401/403 on a signed request only renews the session,
  once.
- **`should_poll` stays false**: the cloud is read on the integration's own
  timer (10 to 120 minutes), beyond what Gladys polls. It never resyncs on
  existing devices. Every feature is read-only.
- **The first round is a baseline**: no scene event replays history after a
  restart or an account change. A scene action never fires a scene trigger;
  `fetch_measure` only asks the Blue Extender (at most every 10 minutes per
  device), the values arrive with the next regular reading.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the password or the AWS credentials (they stay in memory).
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of the widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store). Transport:
  `["cloud"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
