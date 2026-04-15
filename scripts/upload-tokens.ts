/**
 * Upload local DI OAuth tokens to Cloudflare KV.
 *
 * Reads tokens from ~/.garminconnect/garmin_tokens.json (created by auth.py
 * against garminconnect >= 0.3.2) and prints the wrangler commands to upload
 * them to the GARMIN_KV namespace.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const tokenPath = join(homedir(), ".garminconnect", "garmin_tokens.json");

function jwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const b64 = (parts[1] + pad).replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

try {
  const raw = readFileSync(tokenPath, "utf-8");
  const tokens = JSON.parse(raw);

  if (!tokens.di_token || !tokens.di_refresh_token || !tokens.di_client_id) {
    throw new Error(
      "garmin_tokens.json missing one of di_token/di_refresh_token/di_client_id. Library too old?"
    );
  }

  const exp = jwtExp(tokens.di_token);
  console.log("✓ Found DI tokens in ~/.garminconnect/garmin_tokens.json");
  console.log(`  client_id: ${tokens.di_client_id}`);
  if (exp) {
    console.log(`  di_token exp: ${new Date(exp * 1000).toISOString()}`);
  }
  console.log();
  console.log("Run this to upload to Cloudflare KV:");
  console.log("(Namespace ID is in wrangler.jsonc — binding GARMIN_KV)");
  console.log();
  console.log(
    `npx wrangler kv key put --namespace-id=<NAMESPACE_ID> "di_tokens" '${JSON.stringify(tokens)}'`
  );
  console.log();
  console.log("After deploy, delete the stale legacy keys:");
  console.log(`npx wrangler kv key delete --namespace-id=<NAMESPACE_ID> "oauth1_token"`);
  console.log(`npx wrangler kv key delete --namespace-id=<NAMESPACE_ID> "oauth2_token"`);
  console.log(`npx wrangler kv key delete --namespace-id=<NAMESPACE_ID> "oauth_consumer"`);
} catch (e) {
  console.error("Error: Could not read tokens from ~/.garminconnect/garmin_tokens.json");
  console.error("Run auth.py in the garmin-mcp project first (requires garminconnect>=0.3.2).");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
