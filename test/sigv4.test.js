// The SigV4 signature against signatures made by botocore, the reference
// implementation of AWS (test/fixtures/sigv4-botocore.json, generated with
// botocore 1.43: SigV4Auth(credentials, 'execute-api', 'eu-west-1')).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { signRequest, encode, canonicalQuery, amzDate } from '../src/sigv4.js';

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/sigv4-botocore.json', import.meta.url), 'utf8'),
);
const CREDENTIALS = {
  accessKey: 'AKIDEXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const SCOPE = { region: 'eu-west-1', service: 'execute-api' };
const dateOf = (stamp) =>
  new Date(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
  );

test('the same signature as botocore: paths, sorted and encoded queries, POST, token', () => {
  assert.ok(vectors.length >= 5);
  for (const vector of vectors) {
    const headers = signRequest(
      { method: vector.method, url: vector.url },
      { ...CREDENTIALS, sessionToken: vector.token ?? undefined },
      SCOPE,
      dateOf(vector.date),
    );
    assert.equal(headers.Authorization, vector.authorization, `${vector.method} ${vector.url}`);
    assert.equal(headers['X-Amz-Date'], vector.date);
    assert.equal(headers['X-Amz-Security-Token'], vector.token ?? undefined);
  }
});

test('RFC 3986 encoding, sorted query, AWS timestamp', () => {
  assert.equal(encode("a b*!'()~"), 'a%20b%2A%21%27%28%29~');
  assert.equal(canonicalQuery(new URLSearchParams('lang=fr&b=2&a=x y')), 'a=x%20y&b=2&lang=fr');
  assert.equal(amzDate(new Date('2026-11-22T10:15:00.123Z')), '20261122T101500Z');
});

test('the secret never appears in the headers', () => {
  const headers = signRequest(
    { method: 'GET', url: 'https://api.riiotlabs.com/prod/swimming_pool' },
    { ...CREDENTIALS, sessionToken: 'token' },
    SCOPE,
  );
  assert.ok(!JSON.stringify(headers).includes(CREDENTIALS.secretKey));
});
