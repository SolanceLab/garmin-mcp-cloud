---
name: garmin
description: Use Garmin's tools to read the user's own Garmin Connect health data (sleep, heart rate, stress, steps, hydration, cycle) or log water and period dates.
---

# Garmin

Reads the user's own Garmin Connect account. Dates are `YYYY-MM-DD` and default to today.

Read tools: get_daily_summary, get_body_battery, get_sleep_data, get_sleep_detail, get_heart_rate, get_resting_heart_rate, get_stress, get_steps, get_menstrual_cycle, get_hrv, get_hydration, get_activities. Write tools: add_hydration (ml), update_menstrual_cycle (start and end date).

Limits: the Garmin endpoints are unofficial and can change; get_sleep_detail returns about 200 KB per day, so use get_sleep_data for a summary; write tools change the user's Garmin Connect record, so confirm with the user first.
