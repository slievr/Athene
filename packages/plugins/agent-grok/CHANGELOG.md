# @made-by-moonlight/athene-plugin-agent-grok

## 0.2.0

### Minor Changes

- dc706d5: Introduce `ATHENE_*` as the canonical environment-variable prefix, with full
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

### Patch Changes

- Updated dependencies [dc706d5]
  - @made-by-moonlight/athene-core@0.10.0

## 0.1.3

### Patch Changes

- 2f9717f: Load agent-grok package metadata through JSON import attributes so packaged web and CLI runtimes do not keep a publish-host package.json lookup. This also raises the Node.js engine floor to 20.18.3+, where JSON modules with import attributes are non-experimental.

## 0.1.2

### Patch Changes

- 2d4c457: Fix canary nightly to include all publishable packages and fix Next.js import.meta.url build path issue
- Updated dependencies [2d4c457]
  - @made-by-moonlight/athene-core@0.9.1

## 0.1.1

### Patch Changes

- Updated dependencies [73bed33]
- Updated dependencies [a610601]
- Updated dependencies [7d9b862]
- Updated dependencies [6d48022]
- Updated dependencies [fcedb25]
- Updated dependencies [94981dc]
- Updated dependencies [2980570]
- Updated dependencies [d5d0f07]
  - @made-by-moonlight/athene-core@0.9.0
