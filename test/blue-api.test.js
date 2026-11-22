import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBlueClient, kindOfStatus, parseExpiration } from '../src/blue-api.js';
import { blueCloud, NOW, HOUR, EMAIL, PASSWORD, POOL_ID, SERIAL } from './helpers/fixtures.js';

const client = (fetch, account = { email: EMAIL, password: PASSWORD }, now = () => NOW) =>
  createBlueClient({ getAccount: () => account, fetch, now, userAgent: 'test' });

test('logs in once, then signs every request with the session token', async () => {
  const fetch = blueCloud();
  const blue = client(fetch);
  const pools = await blue.listPools();
  await blue.listPoolDevices(POOL_ID);
  await blue.lastMeasurements(POOL_ID, SERIAL);
  assert.equal(pools.data[0].swimming_pool_id, POOL_ID);
  assert.equal(fetch.state.logins, 1);
  const [login, ...signed] = fetch.calls;
  assert.equal(login.path, 'user/login');
  assert.equal(login.method, 'POST');
  for (const call of signed) {
    assert.match(
      call.headers.Authorization,
      /^AWS4-HMAC-SHA256 Credential=ASIA1\/\d{8}\/eu-west-1\/execute-api\/aws4_request, SignedHeaders=host;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/,
    );
    assert.equal(call.headers['X-Amz-Security-Token'], 'session-1');
  }
  assert.equal(signed[2].query, '?mode=blue_and_strip');
});

test('a refused login is an auth error flagged as a login, without the password', async () => {
  const fetch = blueCloud();
  const blue = client(fetch, { email: EMAIL, password: 'wrong' });
  await assert.rejects(blue.listPools(), (err) => {
    assert.equal(err.kind, 'auth');
    assert.equal(err.login, true);
    assert.equal(err.status, 403);
    assert.ok(!err.message.includes('wrong'));
    return true;
  });
  const empty = client(fetch, { email: '', password: '' });
  await assert.rejects(empty.listPools(), { kind: 'auth', login: true });
  assert.equal(fetch.calls.length, 1, 'no request without an account');
});

test('renews the credentials before they expire, and once after a 403', async () => {
  const fetch = blueCloud();
  let now = NOW;
  const blue = client(fetch, { email: EMAIL, password: PASSWORD }, () => now);
  await blue.listPools();
  now = NOW + HOUR - 3 * 60000;
  await blue.listPools();
  assert.equal(fetch.state.logins, 1, 'still valid');
  now = NOW + HOUR - 60000;
  await blue.listPools();
  assert.equal(fetch.state.logins, 2, 'renewed 2 minutes before');
  fetch.state.tokens.clear();
  await blue.listPools();
  assert.equal(fetch.state.logins, 3, 'revoked: one new login');
  // Still refused after a fresh login: an auth error, not a login one.
  fetch.state.tokens = { has: () => false, add: () => {}, clear: () => {} };
  await assert.rejects(blue.listPools(), { kind: 'auth', login: false });
});

test('another account logs in again', async () => {
  const fetch = blueCloud();
  const account = { email: EMAIL, password: PASSWORD };
  const blue = client(fetch, account);
  await blue.listPools();
  fetch.state.email = 'other@example.com';
  account.email = 'other@example.com';
  await blue.listPools();
  assert.equal(fetch.state.logins, 2);
});

test('error kinds: rate limit, outage, network, broken answers', async () => {
  const fetch = blueCloud();
  const blue = client(fetch);
  await blue.listPools();
  fetch.state.failure = 429;
  await assert.rejects(blue.listPools(), { kind: 'rate_limit', status: 429 });
  fetch.state.failure = 502;
  await assert.rejects(blue.listPools(), { kind: 'unreachable' });
  fetch.state.failure = 'network';
  await assert.rejects(blue.listPools(), { kind: 'unreachable' });
  const html = async () => new Response('<html>', { status: 200 });
  const broken = client(async (url, init) =>
    String(url).endsWith('user/login') ? blueCloud()(url, init) : html(),
  );
  await assert.rejects(broken.listPools(), { kind: 'unexpected' });
  assert.equal(kindOfStatus(404), 'unexpected');
  assert.equal(kindOfStatus(401), 'auth');
});

test('the Blue Extender request is a signed POST', async () => {
  const fetch = blueCloud();
  const blue = client(fetch);
  const answer = await blue.releaseLastMeasure(SERIAL);
  assert.equal(answer.message, 'Last unprocessed event released');
  const call = fetch.calls.at(-1);
  assert.equal(call.method, 'POST');
  assert.equal(call.path, `blue/${SERIAL}/releaseLastUnprocessedEvent`);
});

test('expiration: ISO dates, seconds, milliseconds, garbage', () => {
  assert.equal(parseExpiration('2026-07-14T11:00:00.000Z'), NOW + HOUR);
  assert.equal(parseExpiration((NOW + HOUR) / 1000), NOW + HOUR);
  assert.equal(parseExpiration(NOW + HOUR), NOW + HOUR);
  assert.equal(parseExpiration('soon'), null);
  assert.equal(parseExpiration(undefined), null);
});
