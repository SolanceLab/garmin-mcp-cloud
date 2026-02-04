/**
 * Garmin Connect MCP Server — Cloudflare Worker
 *
 * Remote MCP server exposing Anne's Garmin health data.
 * Accessible from Claude mobile, desktop, and web via Streamable HTTP.
 *
 * Auth: API key via Authorization: Bearer header
 * Transport: Streamable HTTP at /mcp
 *
 * Stateless design: Each request creates a fresh McpServer. For non-initialize
 * requests, the server is pre-initialized via sequential handleRequest calls
 * on the same transport instance. This is necessary because Cloudflare Worker
 * isolates don't share memory across HTTP requests.
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

/** Build a fake Request to pass to the transport's handleRequest. */
function makeReq(url: string, headers: Headers, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Create a fresh McpServer + transport, pre-initialized and ready
 * to handle tool calls immediately.
 */
async function createInitializedServer(
  env: Env,
  url: string,
  headers: Headers
): Promise<WebStandardStreamableHTTPServerTransport> {
  const server = new McpServer({ name: "garmin", version: "1.0.0" });
  registerTools(server, env);

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);

  // Step 1: Send initialize request
  await transport.handleRequest(
    makeReq(url, headers, {
      jsonrpc: "2.0",
      id: "__init__",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "garmin-mcp-cloud-internal", version: "1.0.0" },
      },
    })
  );

  // Step 2: Send initialized notification
  await transport.handleRequest(
    makeReq(url, headers, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })
  );

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

    // Only /mcp path
    if (url.pathname !== "/mcp") {
      return corsResponse(404, "Not Found");
    }

    // API key check
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) {
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

    // Create pre-initialized server and handle the actual request
    const transport = await createInitializedServer(
      env,
      request.url,
      request.headers
    );

    // For initialize requests from the real client, we still handle them
    // (the pre-init uses a different id so the SDK treats this as a re-init)
    const actualReq = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
    });

    const response = await transport.handleRequest(actualReq);
    return addCorsHeaders(response);
  },
};
