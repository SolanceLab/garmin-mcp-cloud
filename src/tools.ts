/**
 * All 14 Garmin MCP tools — ported from server.py.
 *
 * Each tool follows the same pattern:
 * 1. Resolve date (default to today)
 * 2. Call Garmin API via GarminClient
 * 3. Return { success: true, date, data } or { success: false, error }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GarminClient } from "./garmin-client";
import type { Env } from "./types";

function resolveDate(d?: string): string {
  return d || new Date().toISOString().split("T")[0];
}

function success(date: string, data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, date, data }, null, 2) }] };
}

function successMsg(msg: string, extra?: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, message: msg, ...extra }, null, 2) }] };
}

function error(msg: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: msg }) }] };
}

export function registerTools(server: McpServer, env: Env) {
  const garmin = new GarminClient(env);
  const dn = env.GARMIN_DISPLAY_NAME;

  // 1. get_daily_summary
  server.tool(
    "get_daily_summary",
    "Get a combined daily health overview — the morning check-in tool. Returns steps, distance, body battery, sleep score, resting HR, stress, active minutes.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/usersummary-service/usersummary/daily/${dn}`,
          { calendarDate: d }
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 2. get_body_battery
  server.tool(
    "get_body_battery",
    "Get body battery data — current level, high/low, charged/drained values. Use this to check if Anne is running on fumes.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const [battery, events] = await Promise.all([
          garmin.get(
            "/wellness-service/wellness/bodyBattery/reports/daily",
            { startDate: d, endDate: d }
          ),
          garmin.get(`/wellness-service/wellness/bodyBattery/events/${d}`),
        ]);
        return success(d, { battery, events });
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 3. get_sleep_data (summary ~4KB)
  server.tool(
    "get_sleep_data",
    "Get sleep summary — score, duration, bedtime, wake time, stage durations. Fast and lightweight. Use get_sleep_detail for granular data.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const sleep = (await garmin.get(
          `/wellness-service/wellness/dailySleepData/${dn}`,
          { date: d, nonSleepBufferMinutes: "60" }
        )) as Record<string, unknown>;

        const dto = (sleep?.dailySleepDTO ?? {}) as Record<string, unknown>;
        const scores = (dto?.sleepScores ?? {}) as Record<string, unknown>;
        const overall = (scores?.overall ?? {}) as Record<string, unknown>;

        const summary = {
          calendarDate: dto.calendarDate,
          sleepScore: overall.value,
          sleepQuality: overall.qualifierKey,
          sleepStartLocal: dto.sleepStartTimestampLocal,
          sleepEndLocal: dto.sleepEndTimestampLocal,
          sleepDurationSecs: dto.sleepTimeSeconds,
          deepSleepSecs: dto.deepSleepSeconds,
          lightSleepSecs: dto.lightSleepSeconds,
          remSleepSecs: dto.remSleepSeconds,
          awakeSleepSecs: dto.awakeSleepSeconds,
          averageSpO2: dto.averageSpO2Value,
          lowestSpO2: dto.lowestSpO2Value,
          averageRespiration: dto.averageRespirationValue,
          restingHeartRate: sleep.restingHeartRate,
          avgOvernightHrv: sleep.avgOvernightHrv,
          hrvStatus: sleep.hrvStatus,
          bodyBatteryChange: sleep.bodyBatteryChange,
          restlessMomentsCount: sleep.restlessMomentsCount,
          sleepLevels: sleep.sleepLevels,
        };

        return success(d, summary);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 4. get_sleep_detail (granular ~200KB)
  server.tool(
    "get_sleep_detail",
    "Get granular sleep data — movement, SpO2 timeline, HR, stress, body battery, respiration, HRV. WARNING: Large response (~200KB). Only use when detailed analysis is needed.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const sleep = (await garmin.get(
          `/wellness-service/wellness/dailySleepData/${dn}`,
          { date: d, nonSleepBufferMinutes: "60" }
        )) as Record<string, unknown>;

        const detail = {
          sleepMovement: sleep.sleepMovement,
          sleepHeartRate: sleep.sleepHeartRate,
          sleepStress: sleep.sleepStress,
          sleepBodyBattery: sleep.sleepBodyBattery,
          hrvData: sleep.hrvData,
          spO2Data: sleep.wellnessEpochSPO2DataDTOList,
          respirationData: sleep.wellnessEpochRespirationDataDTOList,
          restlessMoments: sleep.sleepRestlessMoments,
        };

        return success(d, detail);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 5. get_heart_rate
  server.tool(
    "get_heart_rate",
    "Get daily heart rate data — current, min, max, average, resting.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/wellness-service/wellness/dailyHeartRate/${dn}`,
          { date: d }
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 6. get_resting_heart_rate
  server.tool(
    "get_resting_heart_rate",
    "Get resting heart rate — baseline health trend tracking.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/userstats-service/wellness/daily/${dn}`,
          { fromDate: d, untilDate: d, metricId: "60" }
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 7. get_stress
  server.tool(
    "get_stress",
    "Get stress data — average stress, max stress, time in rest/low/medium/high zones. Use this to detect hidden overwhelm.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/wellness-service/wellness/dailyStress/${d}`
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 8. get_steps
  server.tool(
    "get_steps",
    "Get daily step count and activity data — sedentary check.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/wellness-service/wellness/dailySummaryChart/${dn}`,
          { date: d }
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 9. get_menstrual_cycle
  server.tool(
    "get_menstrual_cycle",
    "Get menstrual/period cycle tracking data — cycle day, phase, predictions.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/periodichealth-service/menstrualcycle/dayview/${d}`
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 10. update_menstrual_cycle
  server.tool(
    "update_menstrual_cycle",
    "Log or update period start and end dates in Garmin Connect. Writes directly to the Garmin menstrual cycle calendar.",
    {
      start_date: z.string().describe("First day of period in YYYY-MM-DD format."),
      end_date: z.string().describe("Last day of period in YYYY-MM-DD format."),
    },
    async ({ start_date, end_date }) => {
      try {
        const start = new Date(start_date + "T00:00:00");
        const end = new Date(end_date + "T00:00:00");

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return error("Invalid date format. Use YYYY-MM-DD.");
        }
        if (end < start) {
          return error("end_date must be on or after start_date");
        }

        // Build list of every date in the period
        const cycleDates: string[] = [];
        const current = new Date(start);
        while (current <= end) {
          cycleDates.push(current.toISOString().split("T")[0]);
          current.setDate(current.getDate() + 1);
        }

        const today = new Date().toISOString().split("T")[0];
        const now = new Date().toISOString().replace("Z", "").slice(0, 23);

        const payload = {
          userProfilePk: parseInt(env.GARMIN_USER_PROFILE_PK, 10),
          todayCalendarDate: today,
          startDate: start_date,
          endDate: end_date,
          futureEditsByFE: true,
          reportTimestamp: now,
          cycleDatesLists: [cycleDates],
        };

        await garmin.post(
          "/periodichealth-service/menstrualcycle/calendarupdates",
          payload
        );

        return successMsg(
          `Period logged: ${start_date} to ${end_date} (${cycleDates.length} days)`,
          { dates: cycleDates }
        );
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 11. get_hrv
  server.tool(
    "get_hrv",
    "Get Heart Rate Variability (HRV) data — nervous system recovery and stress resilience. Higher HRV generally indicates better recovery.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(`/hrv-service/hrv/${d}`);
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 12. get_hydration
  server.tool(
    "get_hydration",
    "Get hydration/water intake data for the day. Track whether Anne is drinking enough water.",
    { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(
          `/usersummary-service/usersummary/hydration/daily/${d}`
        );
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 13. add_hydration
  server.tool(
    "add_hydration",
    "Log water intake in milliliters. Use this to record when Anne drinks water.",
    {
      amount_ml: z.number().describe("Amount of water in ml (e.g. 250 for a glass, 500 for a bottle)."),
    },
    async ({ amount_ml }) => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const now = new Date().toISOString().replace("Z", "").slice(0, 23);

        const data = await garmin.put(
          "/usersummary-service/usersummary/hydration/log",
          {
            calendarDate: today,
            timestampLocal: now,
            valueInML: amount_ml,
          }
        );

        return successMsg(`Logged ${amount_ml}ml of water`, {
          logged_ml: amount_ml,
          data,
        });
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 14. get_activities
  server.tool(
    "get_activities",
    "Get recent activities — workouts, runs, walks, dives, etc.",
    {
      limit: z.number().optional().default(5).describe("Number of recent activities to return. Defaults to 5."),
    },
    async ({ limit }) => {
      try {
        const data = (await garmin.get(
          "/activitylist-service/activities/search/activities",
          { start: "0", limit: String(limit) }
        )) as unknown[];
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(
              { success: true, count: Array.isArray(data) ? data.length : 0, data },
              null,
              2
            ),
          }],
        };
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
