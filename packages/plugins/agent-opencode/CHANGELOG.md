# @made-by-moonlight/athene-plugin-agent-opencode

## 0.11.3

### Patch Changes

- 9b038ff: test: verify release/\* PR merges without CI in workflow
- Updated dependencies [9b038ff]
  - @made-by-moonlight/athene-core@0.11.3

## 0.11.2

### Patch Changes

- 22aef23: test: verify release auto-merge works for release/\* branches
- Updated dependencies [22aef23]
  - @made-by-moonlight/athene-core@0.11.2

## 0.11.1

### Patch Changes

- ed7c6c7: fix: republish athene with correct athene-cli dependency (0.11.0 had workspace:\* dep bug)
- Updated dependencies [ed7c6c7]
  - @made-by-moonlight/athene-core@0.11.1

## 0.11.0

### Minor Changes

- - Merge pull request #41 from slievr/feat/fleet-kanban
  - fix(release): gate publish on did_bump flag not npm check for single package
  - fix(release): gate publish on did_bump flag not npm check for single package
  - fix(release): allow workflow_dispatch to pass job-level if condition
  - fix(release): allow workflow_dispatch to pass the job-level if condition
  - fix(release): list all linked packages in auto-generated changeset to ensure all are bumped
  - fix(release): list all linked packages in auto-generated changeset to ensure all are bumped
  - fix(core): merge duplicate type import in session-parent test
  - fix(release): exclude .github/ from version bump commit to avoid workflows permission error
  - fix(release): exclude .github/ from version bump commit to avoid workflows permission error
  - feat(release): add workflow_dispatch trigger for manual release runs
  - feat(release): add workflow_dispatch trigger for manual release runs
  - fix(release): force-push release branch and skip PR creation if already exists
  - fix(release): force-push release branch and skip PR creation if already exists
  - fix(publish): extract .tgz filename from pnpm pack multi-line output
  - fix(publish): extract .tgz filename from pnpm pack output instead of using full output
  - fix(release): use auto-merge PR for version bump to satisfy branch protection
  - fix(release): use auto-merge PR for version bump to satisfy branch protection
  - fix(web): sync fleet filter with URL params, add chip dots/timestamps, add project session badge
  - feat(web): convert project page to settings view, remove kanban
  - feat(web): add Fleet nav entry to sidebar
  - feat(web): add /fleet route
  - fix(release): use echo instead of printf to avoid bash treating --- as flags
  - feat(web): add FleetBoard component with orchestrator grouping
  - feat(web): add FleetColumn component
  - feat(web): add OrchestratorGroup component
  - feat(web): add FleetFilterBar component
  - feat(web): add accentClass prop to SessionCard for orchestrator border color
  - feat(web): add orchestrator color palette and CSS accent classes
  - feat(release): auto-generate changeset from conventional commits on every merge
  - fix(release): check npm registry instead of git history to detect unpublished versions
  - docs: add fleet kanban implementation plan
  - docs: add fleet kanban design spec
  - feat(core): add getSessionParentId helper and stamp parentSessionId at spawn
  - docs: add fleet kanban implementation plan
  - test(web): fix flaky DirectoryBrowser keyboard-navigation test
  - fix(web): fix spawn form cancel and hide project select for single project
  - docs: add fleet kanban design spec
  - fix(release): restore pnpm pack and auto-publish without version PR
  - fix(web): orchestrator dropdown shows own session + sub-orchestrators only
  - chore: version packages
  - fix(agent-claude-code): correct ao spawn → athene spawn in subagent blocker
  - feat(web): expandable orchestrator session list and inline spawn in sidebar
  - feat(web): add orchestrator session spawning and fix fleet filter
  - fix(publish): use pnpm pack to resolve workspace:\* before npm publish
  - test(web): update SidebarOrchestrators test for session-path collapsed glyph
  - fix(web): orchestrator session routing and sidebar visibility
  - ci: remove dependency-review job (requires GitHub Advanced Security)
  - fix(web,core): orchestrator creation and terminal navigation
  - fix: update CLI tests for removed per-project orchestrator spawn and remove unused imports

### Patch Changes

- Updated dependencies
  - @made-by-moonlight/athene-core@0.11.0

## 0.10.0

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

## 0.9.1

### Patch Changes

- 2d4c457: Fix canary nightly to include all publishable packages and fix Next.js import.meta.url build path issue
- Updated dependencies [2d4c457]
  - @made-by-moonlight/athene-core@0.9.1

## 0.9.0

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

## 0.8.0

### Minor Changes

- Distinguish indeterminate agent process probes from definitive process-missing results, and raise ps probe timeouts to avoid bulk runtime_lost terminations when ps or tmux cannot return a reliable verdict.

### Patch Changes

- Updated dependencies
  - @made-by-moonlight/athene-core@0.8.0

## 0.7.0

### Minor Changes

- 0f5ae0b: feat: native Windows support

  AO now runs natively on Windows. The default runtime on Windows is `process`
  (ConPTY via `node-pty` + named pipes — no tmux, no WSL); the dashboard,
  agents (claude-code, codex, kimicode, aider, opencode, cursor), `athene doctor`,
  and `athene update` all work out of the box. Each session gets a small detached
  pty-host helper that wraps a ConPTY behind `\\.\pipe\ao-pty-<sessionId>`,
  registered so `athene stop` can reach it.

  A new cross-platform abstraction layer (`packages/core/src/platform.ts`)
  centralises every platform branch behind helpers like `isWindows()`,
  `getDefaultRuntime()`, `getShell()`, `killProcessTree()`, `findPidByPort()`,
  and `getEnvDefaults()`. Path comparison uses `pathsEqual` /
  `canonicalCompareKey` to handle NTFS case-insensitivity. PATH wrappers for
  agent plugins (`gh`, `git`) ship as `.cjs` + `.cmd` shims on Windows;
  `script-runner` runs `.ps1` siblings of `.sh` scripts via PowerShell. New
  `athene-doctor.ps1` / `athene-update.ps1` shipped.

  `athene open` is now cross-platform: it sources sessions from `sm.list()`
  instead of `tmux list-sessions` (so `runtime-process` sessions on Windows
  appear), and the open action branches per OS — `open-iterm-tab` stays the
  macOS path, native handling on Windows and Linux.

  Behaviour on macOS and Linux is unchanged. Every Windows path is gated
  behind `isWindows()`; `runtime-tmux` and the bash hook flows are untouched.

  See `docs/CROSS_PLATFORM.md` for the developer reference (helper inventory,
  EPERM-vs-ESRCH gotcha, PowerShell-vs-bash differences, pre-merge checklist).
  The Windows runtime architecture (pty-host, pipe protocol, registry, sweep,
  mux WS Windows branch) is documented in `docs/ARCHITECTURE.md`.

### Patch Changes

- Updated dependencies [0f5ae0b]
- Updated dependencies [fe33bb7]
- Updated dependencies [7c46dc9]
  - @made-by-moonlight/athene-core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies
- Updated dependencies [40aeb78]
- Updated dependencies
- Updated dependencies
  - @made-by-moonlight/athene-core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [dd07b6b]
  - @made-by-moonlight/athene-core@0.5.0

## 0.4.0

### Patch Changes

- 4701122: opencode: bound /tmp blast radius and consolidate session-list cache

  Addresses review feedback on PR #1478:
  - **TMPDIR isolation.** Every `opencode` child we spawn now points at
    `~/.agent-orchestrator/.bun-tmp/` via `TMPDIR`/`TMP`/`TEMP`. Bun's
    embedded shared-library extraction lands there instead of the system
    `/tmp`, so the cli janitor only ever sweeps AO-owned files. Other
    users' or other applications' Bun artifacts on a shared host can no
    longer be touched by the regex.
  - **Single shared session-list cache.** Core and the agent-opencode
    plugin previously kept independent caches; per poll cycle the system
    spawned at least two `opencode session list` processes instead of
    one. Both consumers now use the shared cache exported from
    `@made-by-moonlight/athene-core` (`getCachedOpenCodeSessionList`).
  - **TTL no longer covers the send-confirmation loop.** The cache TTL
    dropped from 3s to 500ms so the
    `updatedAt > baselineUpdatedAt` delivery signal in
    `sendWithConfirmation` actually fires. Concurrent callers still
    share the in-flight promise.
  - **Delete invalidates the cache.** `deleteOpenCodeSession` now calls
    `invalidateOpenCodeSessionListCache()` on success so reuse, remap,
    and restore code paths cannot observe a deleted session id within
    the TTL window.
  - **Janitor reliability.** `sweepOnce` now filters synchronously
    before allocating per-file promises (matters on hosts with thousands
    of `/tmp` entries), and `stopBunTmpJanitor()` is now async and awaits
    any in-flight sweep so SIGTERM cannot exit while `unlink` is mid-flight.
  - **Janitor observability.** The sweep callback in `athene start` now logs
    successful reclaims, not just errors, so operators can confirm the
    janitor is doing useful work.

- Updated dependencies [2306078]
- Updated dependencies [faaddb1]
- Updated dependencies [f330a1e]
- Updated dependencies [a862327]
- Updated dependencies [331f1ce]
- Updated dependencies [703d584]
- Updated dependencies [f674422]
- Updated dependencies [62353eb]
- Updated dependencies [bd36c7b]
- Updated dependencies [e7ad928]
- Updated dependencies [ca8c4cc]
- Updated dependencies [7b82374]
- Updated dependencies [4701122]
- Updated dependencies [c8af50f]
- Updated dependencies [bcdda4b]
- Updated dependencies [1cbf657]
- Updated dependencies [c447c7c]
- Updated dependencies [a45eb32]
- Updated dependencies [7072143]
- Updated dependencies [ed2dcea]
  - @made-by-moonlight/athene-core@0.4.0

## 0.2.0

### Patch Changes

- 3a650b0: Zero-friction onboarding: `athene start` auto-detects project, generates config, and launches dashboard — no prompts, no manual setup. Renamed npm package to `@composio/ao`. Made `@composio/ao-web` publishable with production entry point. Cross-platform agent detection. Auto-port-finding. Permission auto-retry in shell scripts.
- Updated dependencies [3a650b0]
  - @composio/ao-core@0.2.0
