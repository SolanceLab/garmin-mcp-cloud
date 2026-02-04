/**
 * OAuth1 HMAC-SHA1 token refresh for Garmin Connect.
 *
 * Replicates what garth (Python) does: signs a POST to Garmin's
 * OAuth exchange endpoint using the stored OAuth1 token, receives
 * a fresh OAuth2 token in return.
 *
 * Uses Web Crypto API — native to Cloudflare Workers, no dependencies.
 */

import type { OAuth1Token, OAuth2Token, OAuthConsumer, Env } from "./types";

const EXCHANGE_URL =
  "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0";
const CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json";
const CONSUMER_KV_KEY = "oauth_consumer";
const CONSUMER_TTL = 86400; // 24 hours

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function buildOAuth1Header(
  consumer: OAuthConsumer,
  oauth1: OAuth1Token
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const params: Record<string, string> = {
    oauth_consumer_key: consumer.consumer_key,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: oauth1.oauth_token,
    oauth_version: "1.0",
  };

  // Sort parameters alphabetically and build the parameter string
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  // Construct signature base string: METHOD&URL&PARAMS
  const baseString = [
    "POST",
    percentEncode(EXCHANGE_URL),
    percentEncode(paramString),
  ].join("&");

  // Sign with consumer_secret&token_secret
  const signingKey = `${percentEncode(consumer.consumer_secret)}&${percentEncode(oauth1.oauth_token_secret)}`;
  const signature = await hmacSha1(signingKey, baseString);

  params["oauth_signature"] = signature;

  // Build Authorization header
  const headerParts = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

async function getConsumer(kv: KVNamespace): Promise<OAuthConsumer> {
  // Try KV cache first
  const cached = await kv.get(CONSUMER_KV_KEY, "json");
  if (cached) return cached as OAuthConsumer;

  // Fetch from garth's S3 bucket
  const resp = await fetch(CONSUMER_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch OAuth consumer keys: ${resp.status}`);
  }
  const consumer = (await resp.json()) as OAuthConsumer;

  // Cache for 24 hours
  await kv.put(CONSUMER_KV_KEY, JSON.stringify(consumer), {
    expirationTtl: CONSUMER_TTL,
  });

  return consumer;
}

/**
 * Exchange OAuth1 token for a fresh OAuth2 token via Garmin's endpoint.
 * This is what garth does under the hood using requests-oauthlib.
 */
export async function refreshOAuth2Token(
  kv: KVNamespace,
  oauth1: OAuth1Token
): Promise<OAuth2Token> {
  const consumer = await getConsumer(kv);
  const authHeader = await buildOAuth1Header(consumer, oauth1);

  const resp = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "com.garmin.android.apps.connectmobile",
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `OAuth2 token exchange failed (${resp.status}): ${body}`
    );
  }

  const data = (await resp.json()) as OAuth2Token;

  // Calculate absolute expiry timestamps if not provided
  const now = Math.floor(Date.now() / 1000);
  if (!data.expires_at && data.expires_in) {
    data.expires_at = now + data.expires_in;
  }
  if (!data.refresh_token_expires_at && data.refresh_token_expires_in) {
    data.refresh_token_expires_at = now + data.refresh_token_expires_in;
  }

  // Save refreshed token to KV
  await kv.put("oauth2_token", JSON.stringify(data));

  return data;
}
