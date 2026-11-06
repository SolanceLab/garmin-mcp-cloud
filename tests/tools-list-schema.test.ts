// garmin-mcp-cloud — Copyright (c) 2026 House of Solance. PolyForm Noncommercial 1.0.0. Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab/garmin-mcp-cloud)
// Copyright (c) 2026 House of Solance
// Guards the public MCP surface: every tool's name + inputSchema must match the stored snapshot.
// Offline: registers the real tools on a real McpServer and lists them over an in-memory transport.
// Regenerate on purpose with: UPDATE_SNAPSHOT=1 npx vitest run tests/tools-list-schema.test.ts
import { expect, test } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/tools";

const SNAP = new URL("../test/fixtures/tools-list.snapshot.json", import.meta.url);

// The snapshot was captured under zod 3 (zod-to-json-schema). zod 4's converter words some things
// differently without changing what is accepted; strip those wordings from both sides so every real
// difference (name, property, type, enum, default, bound, description, required) still fails the test:
//  - the explicit regex zod 4 adds beside format:"uuid"
//  - the +/- MAX_SAFE_INTEGER bounds zod 4 adds to .int()
function normalise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalise);
  if (node && typeof node === "object") {
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === "pattern" && src.format === "uuid") continue;
      if ((k === "minimum" && v === -Number.MAX_SAFE_INTEGER) || (k === "maximum" && v === Number.MAX_SAFE_INTEGER)) continue;
      out[k] = normalise(v);
    }
    return out;
  }
  return node;
}

async function listAll() {
  const server = new McpServer({ name: "garmin", version: "1.2.0" });
  registerTools(server, { GARMIN_KV: { get: async () => null, put: async () => {} }, API_KEY: "test-only" } as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "snap", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema })).sort((x, y) => x.name.localeCompare(y.name));
}

test("tools/list names and inputSchemas match the snapshot", async () => {
  const actual = await listAll();
  if (process.env.UPDATE_SNAPSHOT) { await writeFile(SNAP, JSON.stringify(actual, null, 2) + "\n"); return; }
  expect(normalise(actual)).toEqual(normalise(JSON.parse(await readFile(SNAP, "utf8"))));
});
