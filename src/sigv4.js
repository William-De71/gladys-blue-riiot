// -----------------------------------------------------------------------------
// AWS Signature Version 4, the way the Blue Riiot cloud wants its requests.
//
// The Blue Riiot API sits behind AWS API Gateway with IAM authorization: the
// login returns temporary AWS credentials (an access key, a secret key and a
// session token), and every other request carries a SigV4 signature made with
// them (service `execute-api`, region `eu-west-1`).
//
// Written on node:crypto alone, after the AWS documentation
// (https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html):
//   1. canonical request: method, URI path, sorted query, signed headers,
//      hash of the body;
//   2. string to sign: algorithm, date, credential scope, hash of (1);
//   3. signing key: HMAC chain of the secret over date, region, service;
//   4. Authorization header.
// The session token is a signed header (`x-amz-security-token`), as botocore
// does. test/sigv4.test.js compares the result with signatures made by
// botocore, the reference implementation of AWS.
// -----------------------------------------------------------------------------

import { createHash, createHmac } from 'node:crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value, 'utf8').digest();

/**
 * @description Percent-encode like RFC 3986 (AWS): every byte except the
 * unreserved characters A-Z a-z 0-9 - _ . ~
 * @param {string} value - The text.
 * @returns {string} The encoded text.
 * @example
 * encode('a b*'); // -> 'a%20b%2A'
 */
function encode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * @description The canonical URI: every segment of the (already encoded)
 * path encoded once more, as AWS asks for every service but S3.
 * @param {string} pathname - `URL.pathname`.
 * @returns {string} The canonical URI.
 * @example
 * canonicalUri('/prod/swimming_pool'); // -> '/prod/swimming_pool'
 */
function canonicalUri(pathname) {
  const path = pathname || '/';
  return path
    .split('/')
    .map((segment) => encode(segment))
    .join('/');
}

/**
 * @description The canonical query string: parameters sorted by name, then
 * value, each encoded.
 * @param {URLSearchParams} params - The query.
 * @returns {string} The canonical query.
 * @example
 * canonicalQuery(new URLSearchParams('mode=blue_and_strip')); // -> 'mode=blue_and_strip'
 */
function canonicalQuery(params) {
  return [...params.entries()]
    .map(([name, value]) => [encode(name), encode(value)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

/**
 * @description `20261122T101500Z` for a date.
 * @param {Date} date - The date.
 * @returns {string} The AWS timestamp.
 */
function amzDate(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * @description Sign a request.
 * @param {object} request - The request.
 * @param {string} request.method - GET, POST…
 * @param {string} request.url - The full URL.
 * @param {string} [request.body] - The body ('' when none).
 * @param {object} credentials - `{ accessKey, secretKey, sessionToken? }`.
 * @param {object} scope - `{ region, service }`.
 * @param {Date} [date] - The signing time (tests).
 * @returns {object} The headers to add: `Authorization`, `X-Amz-Date` and,
 * with a session token, `X-Amz-Security-Token`.
 * @example
 * const headers = signRequest({ method: 'GET', url }, credentials, { region: 'eu-west-1', service: 'execute-api' });
 */
function signRequest(
  { method, url, body = '' },
  { accessKey, secretKey, sessionToken },
  { region, service },
  date = new Date(),
) {
  const target = new URL(url);
  const timestamp = amzDate(date);
  const day = timestamp.slice(0, 8);

  const headers = { host: target.host, 'x-amz-date': timestamp };
  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken;
  }
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names
    .map((name) => `${name}:${String(headers[name]).trim()}\n`)
    .join('');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri(target.pathname),
    canonicalQuery(target.searchParams),
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join('\n');

  const credentialScope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, timestamp, credentialScope, sha256(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const result = {
    Authorization: `${ALGORITHM} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'X-Amz-Date': timestamp,
  };
  if (sessionToken) {
    result['X-Amz-Security-Token'] = sessionToken;
  }
  return result;
}

export { encode, canonicalUri, canonicalQuery, amzDate, signRequest };
