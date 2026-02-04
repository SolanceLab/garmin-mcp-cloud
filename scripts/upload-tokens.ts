/**
 * Upload local garth OAuth tokens to Cloudflare KV.
 *
 * Usage: npm run upload-tokens
 *
 * Reads tokens from ~/.garminconnect/ (created by auth.py)
 * and uploads them to the GARMIN_KV namespace.
 *
 * Note: You still need to use wrangler CLI for this.
 * This script just prints the commands to run.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const tokenDir = join(homedir(), ".garminconnect");

try {
  const oauth1 = readFileSync(join(tokenDir, "oauth1_token.json"), "utf-8");
  const oauth2 = readFileSync(join(tokenDir, "oauth2_token.json"), "utf-8");

  // Validate JSON
  JSON.parse(oauth1);
  const o2 = JSON.parse(oauth2);

  const expiresAt = new Date(o2.expires_at * 1000);
  const refreshExpiresAt = new Date(o2.refresh_token_expires_at * 1000);

  console.log("✓ Found OAuth tokens in ~/.garminconnect/");
  console.log(`  Access token expires:  ${expiresAt.toISOString()}`);
  console.log(`  Refresh token expires: ${refreshExpiresAt.toISOString()}`);
  console.log();
  console.log("Run these commands to upload to Cloudflare KV:");
  console.log("(Replace <NAMESPACE_ID> with your KV namespace ID from wrangler.jsonc)");
  console.log();
  console.log(`npx wrangler kv key put --namespace-id=<NAMESPACE_ID> "oauth1_token" '${oauth1.trim()}'`);
  console.log();
  console.log(`npx wrangler kv key put --namespace-id=<NAMESPACE_ID> "oauth2_token" '${oauth2.trim()}'`);
} catch (e) {
  console.error("Error: Could not read tokens from ~/.garminconnect/");
  console.error("Run auth.py in the garmin-mcp project first to generate tokens.");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
