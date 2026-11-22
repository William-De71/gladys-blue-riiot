import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  hasAccount,
  accountSignature,
  readLanguage,
  POLL_INTERVAL,
} from '../src/config.js';

test('defaults, bounds, the e-mail trimmed and the password kept as typed', () => {
  assert.deepEqual(normalizeConfig(), {
    email: '',
    password: '',
    pollInterval: POLL_INTERVAL.default,
    language: 'auto',
  });
  const config = normalizeConfig({
    email: ' me@example.com\n',
    password: ' p4ss ',
    poll_interval: '2',
    language: 'de',
  });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.password, ' p4ss ', 'spaces may belong to a password');
  assert.equal(config.pollInterval, POLL_INTERVAL.min);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ poll_interval: 600 }).pollInterval, POLL_INTERVAL.max);
  assert.equal(normalizeConfig({ poll_interval: '' }).pollInterval, POLL_INTERVAL.default);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
  assert.equal(normalizeConfig({ email: 42 }).email, '');
  assert.equal(normalizeConfig(null).password, '');
});

test('the account, its signature and the stored language', () => {
  assert.ok(hasAccount(normalizeConfig({ email: 'a@b.c', password: 'x' })));
  assert.ok(!hasAccount(normalizeConfig({ email: 'a@b.c' })));
  assert.ok(!hasAccount(normalizeConfig({ email: '  ', password: 'x' })));
  const one = accountSignature(normalizeConfig({ email: 'a@b.c', password: 'x' }));
  assert.equal(one, accountSignature(normalizeConfig({ email: ' a@b.c ', password: 'x' })));
  assert.notEqual(one, accountSignature(normalizeConfig({ email: 'a@b.c', password: 'y' })));
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'español' }, 'en'), 'en');
  assert.equal(readLanguage(undefined, 'fr'), 'fr');
});
