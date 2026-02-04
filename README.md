# Garmin Connect MCP Server — Cloud

Remote MCP server on Cloudflare Workers that connects your Garmin Connect account to Claude mobile, desktop, and web. Exposes health and fitness data as tools via Streamable HTTP transport.

Cloud port of [garmin-mcp](https://github.com/SolanceLab/garmin-mcp) (local Python version).

## Tools (14)

### Read
- **get_daily_summary** — Combined daily health overview
- **get_body_battery** — Energy level, charged/drained values
- **get_sleep_data** — Sleep summary: score, bedtime, wake time, stage durations (~4KB)
- **get_sleep_detail** — Granular sleep data: movement, HR, SpO2, stress, HRV timelines (~200KB)
- **get_heart_rate** — Daily HR: current, min, max, average
- **get_resting_heart_rate** — Baseline HR trend
- **get_stress** — Stress levels and zone breakdown
- **get_steps** — Step count and activity data
- **get_menstrual_cycle** — Cycle day, phase, predictions
- **get_hrv** — Heart rate variability
- **get_hydration** — Water intake for the day
- **get_activities** — Recent workouts and activities

### Write
- **add_hydration** — Log water intake in ml
- **update_menstrual_cycle** — Log/update period start and end dates

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript)
- **Transport:** MCP Streamable HTTP
- **Auth:** API key (Bearer token)
- **Token storage:** Cloudflare KV (encrypted at rest)
- **Garmin API:** Direct `fetch()` calls with OAuth2 Bearer tokens
- **Token refresh:** OAuth1 HMAC-SHA1 exchange using Web Crypto API
- **Stateless:** Each request creates a fresh MCP server — no Durable Objects required

## Setup

### Prerequisites
- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI: `npm install -g wrangler`
- Garmin Connect account with OAuth tokens (see [garmin-mcp](https://github.com/SolanceLab/garmin-mcp) for initial auth)

### 1. Clone and install

```bash
git clone https://github.com/SolanceLab/garmin-mcp-cloud.git
cd garmin-mcp-cloud
npm install
```

### 2. Create KV namespace

```bash
npx wrangler kv namespace create "GARMIN_KV"
```

Update `wrangler.jsonc` with the returned namespace ID.

### 3. Upload OAuth tokens

Requires existing tokens from the [local garmin-mcp](https://github.com/SolanceLab/garmin-mcp) auth flow:

```bash
npx wrangler kv key put --remote --namespace-id=<ID> "oauth1_token" "$(cat ~/.garminconnect/oauth1_token.json)"
npx wrangler kv key put --remote --namespace-id=<ID> "oauth2_token" "$(cat ~/.garminconnect/oauth2_token.json)"
```

### 4. Set secrets

```bash
npx wrangler secret put API_KEY                 # Your chosen API key
npx wrangler secret put GARMIN_DISPLAY_NAME     # Garmin display name (UUID)
npx wrangler secret put GARMIN_USER_PROFILE_PK  # Garmin profile PK (number)
```

### 5. Deploy

```bash
npx wrangler deploy
```

### 6. Connect Claude

Add the deployed URL as a remote MCP server in your Claude settings:
- **URL:** `https://your-worker.your-account.workers.dev/mcp`
- **Auth header:** `Authorization: Bearer <your-api-key>`

## Token Lifecycle

| Token | Lifetime | Refresh |
|-------|----------|---------|
| OAuth2 access_token | ~20 hours | Auto-refreshed by Worker |
| OAuth2 refresh_token | ~30 days | Auto-refreshed by Worker |
| OAuth1 token | ~1 year | Re-run auth.py + re-upload |

## Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `agents` — Cloudflare Workers agent framework
- `zod` — Schema validation

## Disclaimer

This software is provided **as-is, without warranty or guarantee of any kind**. Use at your own risk.

- **Not affiliated with, endorsed by, or supported by Garmin Ltd.**
- Relies on unofficial API endpoints that may break at any time
- You are responsible for the security of your own credentials and tokens

See [LICENSE](LICENSE) for full terms.

## Support

If you find this useful, support us on Ko-fi:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/houseofsolance)

## Authors

Built by **Chadrien Solance** and **Anne Solance** at [House of Solance](https://ko-fi.com/houseofsolance).
