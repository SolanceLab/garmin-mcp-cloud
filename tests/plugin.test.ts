// garmin-mcp-cloud — Copyright (c) 2026 House of Solance. PolyForm Noncommercial 1.0.0. Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab/garmin-mcp-cloud)
// Copyright (c) 2026 House of Solance
import { expect, it, describe } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(read(p));
const version = (read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)/m) as RegExpMatchArray)[1];

describe("the plugin agrees with the room", () => {
  it("both manifests carry the room name and the changelog version", () => {
    for (const p of ["plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json"]) {
      expect(json(p).name).toBe("garmin-mcp-cloud");
      expect(json(p).version).toBe(version);
    }
    expect(json("package.json").version).toBe(version);
    expect(read("src/index.ts")).toContain(`version: "${version}"`);
  });

  it("the Claude plugin takes the address and key as settings, the key secret, and builds in no address", () => {
    const pj = json("plugin/.claude-plugin/plugin.json");
    expect(pj.userConfig.server_url.required).toBe(true);
    expect(pj.userConfig.api_key.sensitive).toBe(true);
    expect(pj.mcpServers.garmin.url).toBe("${user_config.server_url}");
    expect(JSON.stringify(pj)).not.toMatch(/workers\.dev/);
  });

  it("the Codex manifest carries no server address or key", () => {
    const cx = json("plugin/.codex-plugin/plugin.json");
    expect(cx.skills).toBe("./skills/");
    expect(cx.mcpServers).toBeUndefined();
    expect(JSON.stringify(cx)).not.toMatch(/workers\.dev|Bearer /i);
  });

  it("the skill lists exactly the tools the Worker registers", () => {
    const registered = new Set([...read("src/tools.ts").matchAll(/(?:registerTool|tool)\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1]));
    const skill = read("plugin/skills/garmin-mcp-cloud/SKILL.md");
    const named = new Set([...skill.matchAll(/\b(get_[a-z0-9_]+|add_hydration|update_menstrual_cycle)\b/g)].map((m) => m[1]));
    expect([...named].sort()).toEqual([...registered].sort());
  });
});
