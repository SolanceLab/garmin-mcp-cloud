# Changelog

## 1.1.0

First release under the House of Solance launch standard: PolyForm Noncommercial 1.0.0 licence with Required Notice, standard README, plugin, contract and `make test`. Earlier versions were licensed AGPL-3.0; copies you already have keep that licence.

Dependency security updates: MCP SDK 1.32.1, unused `agents` removed, transitive fixes (npm audit clean for production).

Added six read-only tools: `get_spo2`, `get_respiration`, `get_training_readiness`, `get_training_status`, `get_fitness_age` and `get_dives`, plus a vitest suite (`npm test`).
