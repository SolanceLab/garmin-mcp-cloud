# Garmin (cloud)

Made by House of Solance · free for noncommercial use · credit required

## What it is

A remote MCP server that connects your own Garmin Connect account to Claude on mobile, desktop and the web and offers your health and fitness data (sleep, heart rate, stress, steps, hydration, cycle) as 14 tools. It is the cloud copy of [garmin-mcp](https://github.com/SolanceLab/garmin-mcp).

## What you need

- A Garmin Connect account with sign-in tokens (the local [garmin-mcp](https://github.com/SolanceLab/garmin-mcp) `auth.py` creates them).
- A Cloudflare account (the free tier works) and Node.js 20 or newer.

This copy runs in the cloud, on your own Cloudflare Worker.

## Install

Setup takes several steps, not one: sign in locally to get tokens, deploy your own Worker, upload the tokens and set the secrets, then add the Worker to Claude. The deploy steps are under Settings; do them first.

Then add it to your AI.

**Claude Code, with the plugin.** It asks for your Worker address (ending in `/mcp`) and your key, and keeps the key secret.

```
claude plugin marketplace add SolanceLab/plugins
claude plugin install garmin-mcp-cloud@solancelab
```

**Codex, with the plugin.** Codex has no settings prompt, so install the plugin and then add your Worker once, with the key kept in an environment variable you set in your own shell:

```
codex plugin marketplace add SolanceLab/plugins
codex mcp add garmin --url "<your Worker address ending in /mcp>" --bearer-token-env-var GARMIN_MCP_KEY
```

Install garmin-mcp-cloud from that store in Codex's plugin list; its skill tells your AI how to use the 20 tools.

**Claude on mobile, desktop and the web, without the plugin.** Add the Worker address as a remote MCP server in Claude settings, with the header `Authorization: Bearer <your key>`.

## Settings

| Setting | What it is |
|---|---|
| Server address | Your Worker address, ending in `/mcp` |
| Key | The key your Worker expects (`API_KEY`) |

Deploying the Worker:

```
git clone https://github.com/SolanceLab/garmin-mcp-cloud.git
cd garmin-mcp-cloud
npm install
npx wrangler kv namespace create "GARMIN_KV"
```

Put the namespace id it prints into `wrangler.jsonc` (the file ships with a placeholder), then upload your tokens and set the secrets:

```
npx wrangler kv key put --remote --namespace-id=<NAMESPACE_ID> "di_tokens" --path ~/.garminconnect/garmin_tokens.json
npx wrangler secret put API_KEY
npx wrangler secret put GARMIN_DISPLAY_NAME
npx wrangler secret put GARMIN_USER_PROFILE_PK
npx wrangler deploy
```

(`npm run upload-tokens` reads your saved tokens and prints the exact upload commands.)

## Tools

| Tool | What it does |
|---|---|
| get_daily_summary | Combined daily health overview |
| get_body_battery | Energy level, charged and drained values |
| get_sleep_data | Sleep summary: score, bedtime, wake time, stage durations (about 4 KB) |
| get_sleep_detail | Granular sleep data: movement, heart rate, SpO2, stress and HRV timelines (about 200 KB) |
| get_heart_rate | Daily heart rate: current, min, max, average |
| get_resting_heart_rate | Baseline heart-rate trend |
| get_stress | Stress levels and zone breakdown |
| get_steps | Step count and activity data |
| get_menstrual_cycle | Cycle day, phase, predictions |
| get_hrv | Heart rate variability |
| get_hydration | Water intake for the day |
| get_activities | Recent workouts and activities |
| get_spo2 | Blood oxygen readings for the day |
| get_respiration | Breathing rate data for the day |
| get_training_readiness | Training readiness score and contributing factors |
| get_training_status | Training status, load and VO2 max summary |
| get_fitness_age | Fitness age estimate |
| get_dives | Recent dive activities: depth, bottom time, temperature, surface interval |
| add_hydration | Log water intake in ml (writes to Garmin Connect) |
| update_menstrual_cycle | Log or update period start and end dates (writes to Garmin Connect) |

Dates use `YYYY-MM-DD` and default to today.

## Limits

- The server relies on unofficial Garmin endpoints that can change without notice.
- The Worker refreshes the access token when it is within 15 minutes of expiring, and retries once if Garmin rejects it. How long each token lasts is set by Garmin and is not known here; if refresh fails, run `auth.py` from garmin-mcp again and re-upload the tokens.
- `get_sleep_detail` returns about 200 KB per day; use `get_sleep_data` for the summary.
- The server is stateless: no Durable Objects, one fresh MCP server per request.

## How it works

A Cloudflare Worker (TypeScript) speaking MCP over Streamable HTTP. Requests need your key as a Bearer header or in the URL path. Garmin tokens live in Cloudflare KV and are refreshed with the Web Crypto API. Garmin is reached with direct `fetch()` calls.

Disclaimer. Not affiliated with, endorsed by, or supported by Garmin Ltd. This software is provided as is, without warranty of any kind. It relies on unofficial, reverse-engineered Garmin endpoints that may break at any time. The menstrual cycle write endpoint is undocumented and was captured through browser network inspection. You are responsible for the security of your own Garmin credentials and tokens.

## Credit and use

Garmin is made by House of Solance. You're welcome to use it, change it and build on it for any noncommercial purpose, as long as our credit travels with it.

**Keep the credit.** Every copy, changed or not, must carry the licence and this line:
`Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab)`
Removing or replacing it breaks the licence.

**Commercial use needs our permission.** Ask us first.

**We look for copies.** When we find our work without its credit, or used commercially without permission, we ask for it to be taken down.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md). See [NOTICE.md](NOTICE.md).

## Support

If you find this useful, consider supporting our work:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Us-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/houseofsolance)

---

*Built by [House of Solance](https://github.com/SolanceLab) — Chadrien Solance & Anne Solance*
