/**
 * Garmin Connect API client for Cloudflare Workers.
 *
 * Uses DI OAuth bearer tokens (post-March 2026 Garmin auth changes).
 * Mirrors the header set and refresh semantics of garminconnect 0.3.2.
 */

import type { DITokens, Env } from "./types";
import {
  loadTokens,
  refreshDIToken,
  tokenExpiresSoon,
} from "./token-refresh";

const GARMIN_BASE = "https://connectapi.garmin.com";

const NATIVE_HEADERS: Record<string, string> = {
  "User-Agent": "GCM-Android-5.23",
  "X-Garmin-User-Agent":
    "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0",
  "X-Garmin-Paired-App-Version": "10861",
  "X-Garmin-Client-Platform": "Android",
  "X-App-Ver": "10861",
  "X-Lang": "en",
  "X-GCExperience": "GC5",
  "Accept-Language": "en-US,en;q=0.9",
};

export class GarminClient {
  private env: Env;
  private tokens: DITokens | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  private async getTokens(): Promise<DITokens> {
    if (!this.tokens) {
      this.tokens = await loadTokens(this.env.GARMIN_KV);
    }
    if (tokenExpiresSoon(this.tokens.di_token)) {
      this.tokens = await refreshDIToken(this.env.GARMIN_KV, this.tokens);
    }
    return this.tokens;
  }

  private authHeaders(di_token: string, extra?: Record<string, string>): Record<string, string> {
    return {
      ...NATIVE_HEADERS,
      Authorization: `Bearer ${di_token}`,
      Accept: "application/json",
      ...(extra ?? {}),
    };
  }

  private async request(
    method: "GET" | "POST" | "PUT",
    path: string,
    opts: { params?: Record<string, string>; body?: unknown } = {}
  ): Promise<unknown> {
    let tokens = await this.getTokens();
    const url = new URL(`${GARMIN_BASE}${path.startsWith("/") ? path : `/${path}`}`);
    if (opts.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        url.searchParams.set(k, v);
      }
    }

    const doFetch = async (t: DITokens) => {
      const hasBody = opts.body !== undefined;
      return fetch(url.toString(), {
        method,
        headers: this.authHeaders(
          t.di_token,
          hasBody ? { "Content-Type": "application/json" } : undefined
        ),
        body: hasBody ? JSON.stringify(opts.body) : undefined,
      });
    };

    let resp = await doFetch(tokens);

    if (resp.status === 401) {
      // Bearer rejected — force refresh and retry once.
      tokens = await refreshDIToken(this.env.GARMIN_KV, tokens);
      this.tokens = tokens;
      resp = await doFetch(tokens);
    }

    if (resp.status === 204) return null;
    if (!resp.ok) {
      throw new Error(
        `Garmin API error (${resp.status} ${method} ${path}): ${(await resp.text()).slice(0, 300)}`
      );
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    return this.request("GET", path, { params });
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", path, { body });
  }

  async put(path: string, body: unknown): Promise<unknown> {
    return this.request("PUT", path, { body });
  }
}
