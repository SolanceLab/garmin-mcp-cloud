---
name: garmin-mcp-cloud
description: Use when the user asks about their own Garmin Connect data (sleep, heart rate, stress, steps, body battery, HRV, SpO2, breathing, training readiness or status, fitness age, dives, hydration, menstrual cycle) or wants to log water or period dates. Reads and writes through the user's own Garmin Worker, which talks to Garmin Connect; the answers come back into this conversation.
---

# Garmin (cloud)

These tools read the user's own Garmin Connect account through a Worker the user runs in their own Cloudflare account. Dates are `YYYY-MM-DD` and default to today. This is health data: treat it as private, say only what the user asked for, and keep the Worker's key out of every reply.

## Read tools

get_daily_summary, get_body_battery, get_sleep_data, get_sleep_detail, get_heart_rate, get_resting_heart_rate, get_stress, get_steps, get_menstrual_cycle, get_hrv, get_hydration, get_activities, get_spo2, get_respiration, get_training_readiness, get_training_status, get_fitness_age, get_dives.

Start with `get_daily_summary` for "how am I doing". Use `get_sleep_data` for a sleep summary: `get_sleep_detail` returns about 200 KB per day and should be asked for only when the user wants the timelines.

## Write tools (they change the user's Garmin Connect record)

- `add_hydration`: log water in ml.
- `update_menstrual_cycle`: log or update period start and end dates.

Confirm the exact values with the user before calling either one, and say afterwards what was written.

## If the tools are missing

In Claude Code the plugin asks for two settings when installed: the Worker address (ending in `/mcp`) and the key. In Codex there is no settings prompt, so the user adds the Worker once, with the key kept in their environment:

```
export GARMIN_MCP_KEY=...   # the user does this in their own shell, never in this chat
codex mcp add garmin --url "<Worker address ending in /mcp>" --bearer-token-env-var GARMIN_MCP_KEY
```

Keep the key out of the chat: the user sets it in their own shell, and you refer to it by its variable name only. If the user has no Worker yet, setup is in the repository README (https://github.com/SolanceLab/garmin-mcp-cloud): sign in locally to get tokens, create the Worker, upload the tokens, set the key.

## Limits

The Garmin endpoints are unofficial and can change without notice. If a tool says the tokens could not be refreshed, the user signs in again locally and re-uploads the tokens.
