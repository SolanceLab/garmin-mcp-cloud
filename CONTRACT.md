# Garmin contract

## Doors it offers

| Door | What it answers |
|---|---|
| get_daily_summary | Reads from Garmin Connect |
| get_body_battery | Reads from Garmin Connect |
| get_sleep_data | Reads from Garmin Connect |
| get_sleep_detail | Reads from Garmin Connect |
| get_heart_rate | Reads from Garmin Connect |
| get_resting_heart_rate | Reads from Garmin Connect |
| get_stress | Reads from Garmin Connect |
| get_steps | Reads from Garmin Connect |
| get_menstrual_cycle | Reads from Garmin Connect |
| get_hrv | Reads from Garmin Connect |
| get_hydration | Reads from Garmin Connect |
| get_activities | Reads from Garmin Connect |
| add_hydration | Writes to Garmin Connect |
| update_menstrual_cycle | Writes to Garmin Connect |

Served over MCP Streamable HTTP at `/mcp` (key as Bearer header or in the URL path `/mcp/<key>`).

## Data it owns

| Table / bucket / file | What is in it |
|---|---|
| Cloudflare KV `GARMIN_KV`, key `di_tokens` | Saved Garmin sign-in tokens, refreshed by the Worker |

It stores no health data; every answer is read from Garmin Connect on request.

## Settings and secrets it needs

Named here, never valued.

| Name | What it is |
|---|---|
| API_KEY | The key callers must present (secret) |
| GARMIN_DISPLAY_NAME | Your Garmin display name (secret) |
| GARMIN_USER_PROFILE_PK | Your Garmin profile number (secret) |
| GARMIN_KV | KV namespace binding that holds the tokens (id set in `wrangler.jsonc`) |
