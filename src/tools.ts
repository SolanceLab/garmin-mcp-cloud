// garmin-mcp-cloud — Copyright (c) 2026 House of Solance. PolyForm Noncommercial 1.0.0. Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab/garmin-mcp-cloud)
// Copyright (c) 2026 House of Solance
/**
 * All 20 Garmin MCP tools — ported from server.py.
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
  return d || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];
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

// Garmin dive activity type keys (parent type: diving). Includes apnea_hunting and pool_apnea,
// which do not contain the word "diving".
const DIVE_TYPE_KEYS = new Set([
  "diving", "scuba_diving", "apnea_diving", "apnea_hunting", "pool_apnea",
  "single_gas_diving", "multi_gas_diving", "gauge_diving", "ccr_diving",
]);

// zod 3 advertised additionalProperties:false on every tool input; zod 4 omits it, which would let
// clients believe extra arguments are accepted. Re-state it explicitly; unknown keys are still stripped
// at parse time exactly as before (z.object, not z.strictObject).
const args = <T extends z.ZodRawShape>(shape: T) => z.object(shape).meta({ additionalProperties: false });
type ToolArgs<T extends z.ZodRawShape> = z.infer<z.ZodObject<T>>;

export function registerTools(server: McpServer, env: Env) {
  const garmin = new GarminClient(env);
  const dn = env.GARMIN_DISPLAY_NAME;
  // server.tool() only takes a raw shape, which would drop the meta above; registerTool takes the object schema.
  const tool = <T extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: z.ZodObject<T>,
    cb: (a: ToolArgs<T>) => Promise<{ content: { type: "text"; text: string }[] }>,
  ) => server.registerTool(name, { description, inputSchema }, (a: any) => cb(a));

  // 1. get_daily_summary
  tool(
    "get_daily_summary",
    "Get a combined daily health overview — the morning check-in tool. Returns steps, distance, body battery, sleep score, resting HR, stress, active minutes.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_body_battery",
    "Get body battery data — current level, high/low, charged/drained values. Use this to check energy reserves.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_sleep_data",
    "Get sleep summary — score, duration, bedtime, wake time, stage durations. Fast and lightweight. Use get_sleep_detail for granular data.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_sleep_detail",
    "Get granular sleep data — movement, SpO2 timeline, HR, stress, body battery, respiration, HRV. WARNING: Large response (~200KB). Only use when detailed analysis is needed.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_heart_rate",
    "Get daily heart rate data — current, min, max, average, resting.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_resting_heart_rate",
    "Get resting heart rate — baseline health trend tracking.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_stress",
    "Get stress data — average stress, max stress, time in rest/low/medium/high zones. Use this to detect hidden overwhelm.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_steps",
    "Get daily step count and activity data — sedentary check.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_menstrual_cycle",
    "Get menstrual/period cycle tracking data — cycle day, phase, predictions.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "update_menstrual_cycle",
    "Log or update period start and end dates in Garmin Connect. Writes directly to the Garmin menstrual cycle calendar.",
    args({
      start_date: z.string().describe("First day of period in YYYY-MM-DD format."),
      end_date: z.string().describe("Last day of period in YYYY-MM-DD format."),
    }),
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

        const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
        const today = wibNow.toISOString().split("T")[0];
        const now = wibNow.toISOString().replace("Z", "").slice(0, 23);

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
  tool(
    "get_hrv",
    "Get Heart Rate Variability (HRV) data — nervous system recovery and stress resilience. Higher HRV generally indicates better recovery.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "get_hydration",
    "Get hydration/water intake data for the day. Track daily water intake progress.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
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
  tool(
    "add_hydration",
    "Log water intake in milliliters. Use this to record water consumption.",
    args({
      amount_ml: z.number().describe("Amount of water in ml (e.g. 250 for a glass, 500 for a bottle)."),
    }),
    async ({ amount_ml }) => {
      try {
        const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
        const today = wibNow.toISOString().split("T")[0];
        const now = wibNow.toISOString().replace("Z", "").slice(0, 23);

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
  tool(
    "get_activities",
    "Get recent activities — workouts, runs, walks, dives, etc.",
    args({
      limit: z.number().optional().default(5).describe("Number of recent activities to return. Defaults to 5."),
    }),
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

  // 15. get_spo2
  tool(
    "get_spo2",
    "Get blood oxygen (SpO2) readings for the day.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(`/wellness-service/wellness/dailySpo2/${d}`);
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 16. get_respiration
  tool(
    "get_respiration",
    "Get breathing rate (respiration) data for the day.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(`/wellness-service/wellness/daily/respiration/${d}`);
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 17. get_training_readiness
  tool(
    "get_training_readiness",
    "Get the training readiness score and its contributing factors for the day.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(`/metrics-service/metrics/trainingreadiness/${d}`);
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 18. get_training_status
  tool(
    "get_training_status",
    "Get the training status, load and VO2 max summary for the day.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(`/metrics-service/metrics/trainingstatus/aggregated/${d}`);
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 19. get_fitness_age
  tool(
    "get_fitness_age",
    "Get the Garmin fitness age estimate and its contributing factors for the day.",
    args({ date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") }),
    async ({ date }) => {
      const d = resolveDate(date);
      try {
        const data = await garmin.get(`/fitnessage-service/fitnessage/${d}`);
        return success(d, data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // 20. get_dives
  tool(
    "get_dives",
    "Get recent dive activities with depth, bottom time, temperature and surface interval, with depth as Garmin reports it.",
    args({
      limit: z.number().optional().default(5).describe("Number of recent dives to return. Defaults to 5, maximum 50."),
    }),
    async ({ limit }) => {
      try {
        const n = Math.max(1, Math.min(50, Math.floor(limit)));
        const isDive = (a: Record<string, any>) => {
          const key = String(a?.activityType?.typeKey ?? "").toLowerCase();
          if (key.includes("sky")) return false;
          return DIVE_TYPE_KEYS.has(key) || key.endsWith("diving");
        };
        const pageSize = 100;
        const maxPages = 10;
        const found: Record<string, any>[] = [];
        let scanned = 0;
        let hitCap = false;
        for (let page = 0; page < maxPages && found.length < n; page++) {
          const res = (await garmin.get(
            "/activitylist-service/activities/search/activities",
            { start: String(page * pageSize), limit: String(pageSize) }
          )) as unknown;
          const rows = Array.isArray(res) ? (res as Record<string, any>[]) : [];
          scanned += rows.length;
          for (const a of rows) if (isDive(a)) found.push(a);
          if (rows.length < pageSize) break;
          if (page === maxPages - 1 && found.length < n) hitCap = true;
        }
        const list = found;
        const fields = [
          "activityId", "startTimeLocal", "activityName", "duration", "maxDepth", "avgDepth",
          "bottomTime", "minTemperature", "maxTemperature", "surfaceInterval", "diveNumber", "isDecoDive",
        ];
        const dives = list
          .slice(0, n)
          .map((a) => {
            const out: Record<string, unknown> = {};
            for (const f of fields) {
              if (a[f] !== undefined && a[f] !== null) out[f] = a[f];
            }
            return out;
          });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: dives.length,
              ...(hitCap ? { truncated: true, note: `Scanned only the ${scanned} most recent activities; older dives may exist.` } : {}),
              data: dives,
            }, null, 2),
          }],
        };
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
