---
"@made-by-moonlight/athene-core": minor
"@made-by-moonlight/athene-cli": minor
"@made-by-moonlight/athene-web": minor
"@made-by-moonlight/athene-plugin-agent-claude-code": minor
"@made-by-moonlight/athene-plugin-agent-aider": minor
"@made-by-moonlight/athene-plugin-agent-codex": minor
"@made-by-moonlight/athene-plugin-agent-cursor": minor
"@made-by-moonlight/athene-plugin-agent-grok": minor
"@made-by-moonlight/athene-plugin-agent-kimicode": minor
"@made-by-moonlight/athene-plugin-agent-opencode": minor
---

Introduce `ATHENE_*` as the canonical environment-variable prefix, with full
backward compatibility for the legacy `AO_*` prefix. **Non-breaking / additive.**

Environment-variable names now live in a single source-of-truth module,
`packages/core/src/env.ts` (exported as `ENV` / `ENV_PREFIX` from
`@made-by-moonlight/athene-core`). The read side prefers the canonical
`ATHENE_*` name and transparently falls back to the legacy `AO_*` name
(`getEnvString` / `isEnvFlagEnabled`). The set side emits BOTH names on every
spawned child process (`withLegacyEnvAliases`), and generated agent hook scripts
(claude-code metadata/subagent-blocker bash + node variants, the gh/git PATH
wrappers) read with the same `ATHENE_*`-preferred, `AO_*`-fallback logic.

What this means:
- New code and docs should prefer `ATHENE_*` (e.g. `ATHENE_CONFIG_PATH`,
  `ATHENE_SHELL`, `ATHENE_PUBLIC_URL`).
- Existing setups keep working unchanged: anything exporting `AO_*` — the live
  `ao` fleet, `~/.ao/bin` wrappers, already-spawned sessions, external scripts,
  reverse-proxy configs — is still fully honored. `ATHENE_*` wins when both are
  set.

Out of scope (unchanged): the `~/.ao/bin` PATH wrappers, `.ao/` workspace
directories, the `ao` CLI binary, and the `@made-by-moonlight/athene-*` package
names.
