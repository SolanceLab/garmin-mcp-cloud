# Changelog

## 1.2.0

Installable as a plugin for Claude Code and Codex. The plugin is named `garmin-mcp-cloud`, as the room is (it was `garmin`), and its skill now covers all 20 tools. In Claude Code the plugin asks for your Worker address and key when you install it. Codex has no settings prompt, so its skill shows the one command that adds your Worker with the key read from an environment variable. The Worker itself is unchanged apart from the version it reports.

## 1.1.0

First release under the House of Solance launch standard: PolyForm Noncommercial 1.0.0 licence with Required Notice, standard README, plugin, contract and `make test`. Earlier versions were licensed AGPL-3.0; copies you already have keep that licence.

Dependency security updates: MCP SDK 1.32.1, unused `agents` removed, transitive fixes (npm audit clean for production).

Added six read-only tools: `get_spo2`, `get_respiration`, `get_training_readiness`, `get_training_status`, `get_fitness_age` and `get_dives`, plus a vitest suite (`npm test`).
