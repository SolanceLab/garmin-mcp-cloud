// Copyright (c) 2026 House of Solance
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const env = {
  GARMIN_KV: { get: async () => null, put: async () => {} },
  API_KEY: "secret-key",
  GARMIN_DISPLAY_NAME: "uuid-1",
  GARMIN_USER_PROFILE_PK: "1",
} as any;

const EXPECTED_TOOLS = [
  "get_daily_summary", "get_steps", "get_heart_rate", "get_resting_heart_rate", "get_sleep_data",
  "get_sleep_detail", "get_stress", "get_body_battery", "get_hrv", "get_activities",
  "get_hydration", "add_hydration", "get_menstrual_cycle", "update_menstrual_cycle",
  "get_spo2", "get_respiration", "get_training_readiness", "get_training_status",
  "get_fitness_age", "get_dives",
];

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return worker.fetch(
    new Request(`https://x.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    }),
    env
  );
}

const listReq = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

describe("worker request path", () => {
  it("tools/list returns all 20 tools (key in path)", async () => {
    const res = await post("/mcp/secret-key", listReq);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    const names = json.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("handles initialize from a real client", async () => {
    const res = await post("/mcp/secret-key", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).result.serverInfo.name).toBe("garmin");
  });

  it("accepts the key as a Bearer header", async () => {
    const res = await post("/mcp", listReq, { authorization: "Bearer secret-key" });
    expect(res.status).toBe(200);
  });

  it("rejects a missing or wrong key with 401", async () => {
    expect((await post("/mcp", listReq)).status).toBe(401);
    expect((await post("/mcp/wrong", listReq)).status).toBe(401);
    expect((await post("/mcp", listReq, { authorization: "Bearer wrong" })).status).toBe(401);
  });

  it("answers /health", async () => {
    const res = await worker.fetch(new Request("https://x.test/health"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Garmin MCP Cloud — OK");
  });
});
