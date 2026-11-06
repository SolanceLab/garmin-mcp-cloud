// garmin-mcp-cloud — Copyright (c) 2026 House of Solance. PolyForm Noncommercial 1.0.0. Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab/garmin-mcp-cloud)
// Copyright (c) 2026 House of Solance
/**
 * Garmin Connect MCP Server — Cloudflare Worker
 *
 * Remote MCP server exposing Garmin health data.
 * Accessible from Claude mobile, desktop, and web via Streamable HTTP.
 *
 * Auth: API key via URL path (/mcp/{key}) or Authorization: Bearer header
 * Transport: Streamable HTTP at /mcp/{key}
 *
 * Stateless design: each request creates a fresh McpServer and transport,
 * because Cloudflare Worker isolates don't share memory across HTTP requests.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools";
import type { Env } from "./types";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function corsResponse(status: number, body?: string): Response {
  return new Response(body ?? null, { status, headers: CORS_HEADERS });
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Create a fresh McpServer + stateless transport for one request.
 * SDK >= 1.26 refuses to reuse a stateless transport, so each request gets its own.
 */
async function createServer(env: Env): Promise<WebStandardStreamableHTTPServerTransport> {
  const server = new McpServer({ name: "garmin", version: "1.2.0" });
  registerTools(server, env);

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(204);
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return corsResponse(200, "Garmin MCP Cloud — OK");
    }

    // Auth: accept key via URL path (/mcp/{key}) or Authorization header
    const pathMatch = url.pathname.match(/^\/mcp\/(.+)$/);
    const urlKey = pathMatch?.[1];
    const headerKey = request.headers.get("Authorization")?.replace("Bearer ", "");
    const providedKey = urlKey || headerKey;

    if (!url.pathname.startsWith("/mcp")) {
      return corsResponse(404, "Not Found");
    }

    if (!providedKey || providedKey !== env.API_KEY) {
      return corsResponse(401, "Unauthorized");
    }

    if (request.method === "DELETE") {
      return corsResponse(200, "Session closed");
    }

    if (request.method !== "POST") {
      return corsResponse(405, "Method Not Allowed");
    }

    // Parse the incoming JSON-RPC message
    const body = await request.json() as Record<string, unknown> | Record<string, unknown>[];
    const first = Array.isArray(body) ? body[0] : body;
    const method = first?.method as string | undefined;

    // Notifications — just accept (no server state needed)
    if (!first?.id && method?.startsWith("notifications/")) {
      return corsResponse(202);
    }

    // Fresh stateless server per request (Worker isolates share no memory)
    const transport = await createServer(env);
    const actualReq = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
    });

    const response = await transport.handleRequest(actualReq);
    return addCorsHeaders(response);
  },
};
