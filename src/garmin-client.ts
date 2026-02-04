/**
 * Garmin Connect API client for Cloudflare Workers.
 *
 * Makes direct HTTP calls to connectapi.garmin.com using stored OAuth tokens.
 * Handles automatic token refresh when the access token expires.
 */

import type { OAuth1Token, OAuth2Token, Env } from "./types";
import { refreshOAuth2Token } from "./token-refresh";

const GARMIN_BASE = "https://connectapi.garmin.com";
const USER_AGENT = "com.garmin.android.apps.connectmobile";

export class GarminClient {
  private env: Env;
  private oauth2Cache: OAuth2Token | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Get a valid OAuth2 access token, refreshing if expired.
   */
  private async getAccessToken(): Promise<string> {
    // Use cached token if still valid
    if (this.oauth2Cache) {
      const now = Math.floor(Date.now() / 1000);
      if (this.oauth2Cache.expires_at > now + 60) {
        return this.oauth2Cache.access_token;
      }
    }

    // Load from KV
    const tokenJson = await this.env.GARMIN_KV.get("oauth2_token");
    if (!tokenJson) {
      throw new Error(
        "No OAuth2 token in KV. Upload tokens first."
      );
    }

    let oauth2 = JSON.parse(tokenJson) as OAuth2Token;
    const now = Math.floor(Date.now() / 1000);

    // Check if access token expired
    if (oauth2.expires_at <= now + 60) {
      // Load OAuth1 token for refresh
      const oauth1Json = await this.env.GARMIN_KV.get("oauth1_token");
      if (!oauth1Json) {
        throw new Error(
          "No OAuth1 token in KV. Re-run auth.py and re-upload tokens."
        );
      }
      const oauth1 = JSON.parse(oauth1Json) as OAuth1Token;

      // Refresh
      oauth2 = await refreshOAuth2Token(this.env.GARMIN_KV, oauth1);
    }

    this.oauth2Cache = oauth2;
    return oauth2.access_token;
  }

  /**
   * Make an authenticated GET request to the Garmin API.
   */
  async get(
    path: string,
    params?: Record<string, string>
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = new URL(`${GARMIN_BASE}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
    });

    if (resp.status === 204) return null;

    if (resp.status === 401 || resp.status === 403) {
      // Token might have been revoked — clear cache and retry once
      this.oauth2Cache = null;
      const freshToken = await this.getAccessToken();
      const retry = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${freshToken}`,
          "User-Agent": USER_AGENT,
        },
      });
      if (!retry.ok) {
        throw new Error(`Garmin API error (${retry.status}): ${await retry.text()}`);
      }
      if (retry.status === 204) return null;
      return retry.json();
    }

    if (!resp.ok) {
      throw new Error(`Garmin API error (${resp.status}): ${await resp.text()}`);
    }

    return resp.json();
  }

  /**
   * Make an authenticated POST request to the Garmin API.
   */
  async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${GARMIN_BASE}${path}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 204) return null;

    if (!resp.ok) {
      throw new Error(`Garmin API error (${resp.status}): ${await resp.text()}`);
    }

    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * Make an authenticated PUT request to the Garmin API.
   */
  async put(path: string, body: unknown): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${GARMIN_BASE}${path}`;

    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 204) return null;

    if (!resp.ok) {
      throw new Error(`Garmin API error (${resp.status}): ${await resp.text()}`);
    }

    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }
}
