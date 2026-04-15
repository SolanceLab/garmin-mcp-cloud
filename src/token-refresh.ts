/**
 * DI OAuth bearer token refresh for Garmin Connect.
 *
 * Garmin deprecated garth's OAuth1→OAuth2 exchange flow in late March 2026.
 * New flow ("DI OAuth") uses a simple bearer JWT (`di_token`) plus an opaque
 * refresh token, minted via the Android app client.
 *
 * Mirrors `_refresh_di_token` from garminconnect 0.3.2 (Python).
 */

import type { DITokens, Env } from "./types";

const DI_TOKEN_URL =
  "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const KV_KEY = "di_tokens";

function buildBasicAuth(clientId: string): string {
  return "Basic " + btoa(`${clientId}:`);
}

/**
 * Load DI tokens from KV. Throws if unseeded.
 */
export async function loadTokens(kv: KVNamespace): Promise<DITokens> {
  const json = await kv.get(KV_KEY);
  if (!json) {
    throw new Error(
      `No DI tokens in KV (key="${KV_KEY}"). Run upload-tokens script.`
    );
  }
  return JSON.parse(json) as DITokens;
}

export async function saveTokens(
  kv: KVNamespace,
  tokens: DITokens
): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(tokens));
}

/**
 * Decode a JWT's exp claim. Returns seconds-since-epoch or null.
 */
export function jwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const b64 = (parts[1] + pad).replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function tokenExpiresSoon(token: string, skewSeconds = 900): boolean {
  const exp = jwtExp(token);
  if (!exp) return false;
  return Math.floor(Date.now() / 1000) > exp - skewSeconds;
}

/**
 * Exchange the refresh token for a fresh DI bearer JWT.
 * Updates KV with the new tokens.
 */
export async function refreshDIToken(
  kv: KVNamespace,
  current: DITokens
): Promise<DITokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: current.di_client_id,
    refresh_token: current.di_refresh_token,
  });

  const resp = await fetch(DI_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuth(current.di_client_id),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
      "User-Agent": "GCM-Android-5.23",
      "X-Garmin-User-Agent":
        "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0",
      "X-Garmin-Paired-App-Version": "10861",
      "X-Garmin-Client-Platform": "Android",
      "X-App-Ver": "10861",
      "X-Lang": "en",
      "X-GCExperience": "GC5",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(
      `DI token refresh failed (${resp.status}): ${txt.slice(0, 300)}`
    );
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
  };

  const next: DITokens = {
    di_token: data.access_token,
    di_refresh_token: data.refresh_token ?? current.di_refresh_token,
    di_client_id: current.di_client_id,
  };

  await saveTokens(kv, next);
  return next;
}
