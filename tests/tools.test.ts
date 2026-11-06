// garmin-mcp-cloud — Copyright (c) 2026 House of Solance. PolyForm Noncommercial 1.0.0. Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab/garmin-mcp-cloud)
// Copyright (c) 2026 House of Solance
import { beforeEach, expect, it, vi, describe, afterEach } from "vitest";
import { registerTools } from "../src/tools";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;

function setup() {
  const handlers: Record<string, Handler> = {};
  const server = { registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } };
  const env = {
    GARMIN_KV: { get: async () => JSON.stringify({ di_token: "x", di_refresh_token: "y", di_client_id: "z" }), put: async () => {} },
    API_KEY: "k",
    GARMIN_DISPLAY_NAME: "uuid-1",
    GARMIN_USER_PROFILE_PK: "1",
  };
  registerTools(server as any, env as any);
  return handlers;
}

let calls: URL[];
function mockFetch(body: unknown, status = 200) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    calls.push(new URL(u));
    return new Response(JSON.stringify(body), { status });
  }));
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const dated: [string, string][] = [
  ["get_spo2", "/wellness-service/wellness/dailySpo2/2026-10-01"],
  ["get_respiration", "/wellness-service/wellness/daily/respiration/2026-10-01"],
  ["get_training_readiness", "/metrics-service/metrics/trainingreadiness/2026-10-01"],
  ["get_training_status", "/metrics-service/metrics/trainingstatus/aggregated/2026-10-01"],
  ["get_fitness_age", "/fitnessage-service/fitnessage/2026-10-01"],
];

describe("dated tools", () => {
  for (const [name, path] of dated) {
    it(`${name} calls ${path} and returns the body`, async () => {
      const h = setup();
      mockFetch({ marker: name });
      const out = JSON.parse((await h[name]({ date: "2026-10-01" })).content[0].text);
      expect(calls[0].pathname).toBe(path);
      expect(out).toEqual({ success: true, date: "2026-10-01", data: { marker: name } });
    });
    it(`${name} reports upstream errors`, async () => {
      const h = setup();
      mockFetch({ message: "nope" }, 500);
      const out = JSON.parse((await h[name]({ date: "2026-10-01" })).content[0].text);
      expect(out.success).toBe(false);
      expect(out.error).toContain("Garmin API error (500 GET");
    });
  }
});

describe("get_dives", () => {
  it("keeps only dives and listed fields", async () => {
    const h = setup();
    mockFetch([
      { activityId: 1, activityType: { typeKey: "running" }, activityName: "Run" },
      { activityId: 2, activityType: { typeKey: "apnea_diving" }, startTimeLocal: "t", activityName: "Dive", duration: 60, maxDepth: 12.5, avgDepth: 6, bottomTime: 30, minTemperature: 20, maxTemperature: 28, surfaceInterval: 100, diveNumber: 3, isDecoDive: false, secret: "drop" },
    ]);
    const out = JSON.parse((await h.get_dives({ limit: 5 })).content[0].text);
    expect(out.count).toBe(1);
    expect(out.data[0]).toEqual({ activityId: 2, startTimeLocal: "t", activityName: "Dive", duration: 60, maxDepth: 12.5, avgDepth: 6, bottomTime: 30, minTemperature: 20, maxTemperature: 28, surfaceInterval: 100, diveNumber: 3, isDecoDive: false });
    expect(calls[0].pathname).toBe("/activitylist-service/activities/search/activities");
  });
  it("excludes sky_diving activities", async () => {
    const h = setup();
    mockFetch([
      { activityId: 1, activityType: { typeKey: "sky_diving" }, activityName: "Skydive" },
      { activityId: 2, activityType: { typeKey: "scuba_diving" } },
    ]);
    const out = JSON.parse((await h.get_dives({ limit: 5 })).content[0].text);
    expect(out.data).toEqual([{ activityId: 2 }]);
  });
  it("keeps apnea_hunting and pool_apnea dives", async () => {
    const h = setup();
    mockFetch([
      { activityId: 1, activityType: { typeKey: "apnea_hunting" } },
      { activityId: 2, activityType: { typeKey: "pool_apnea" } },
      { activityId: 3, activityType: { typeKey: "running" } },
    ]);
    const out = JSON.parse((await h.get_dives({ limit: 5 })).content[0].text);
    expect(out.data).toEqual([{ activityId: 1 }, { activityId: 2 }]);
  });
  it("flags truncation when the scan cap is reached", async () => {
    const h = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(
      Array.from({ length: 100 }, (_, i) => ({ activityId: i, activityType: { typeKey: "running" } }))), { status: 200 })));
    const out = JSON.parse((await h.get_dives({ limit: 5 })).content[0].text);
    expect(out.truncated).toBe(true);
  });
  it("omits missing fields and respects limit", async () => {
    const h = setup();
    mockFetch([
      { activityId: 1, activityType: { typeKey: "scuba_diving" } },
      { activityId: 2, activityType: { typeKey: "scuba_diving" } },
    ]);
    const out = JSON.parse((await h.get_dives({ limit: 1 })).content[0].text);
    expect(out.data).toEqual([{ activityId: 1 }]);
  });
  it("paginates past the first page to find older dives", async () => {
    const h = setup();
    calls = [];
    const full = Array.from({ length: 100 }, (_, i) => ({ activityId: i, activityType: { typeKey: "running" } }));
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      calls.push(url);
      const body = url.searchParams.get("start") === "0" ? full : [{ activityId: 999, activityType: { typeKey: "scuba_diving" } }];
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const out = JSON.parse((await h.get_dives({ limit: 5 })).content[0].text);
    expect(out.data).toEqual([{ activityId: 999 }]);
    expect(calls.map((c) => c.searchParams.get("start"))).toEqual(["0", "100"]);
  });
  it("reports upstream errors", async () => {
    const h = setup();
    mockFetch({}, 503);
    const out = JSON.parse((await h.get_dives({ limit: 5 })).content[0].text);
    expect(out.success).toBe(false);
  });
});
