# @made-by-moonlight/athene

## 0.11.2

### Patch Changes

- 22aef23: test: verify release auto-merge works for release/\* branches
- Updated dependencies [22aef23]
  - @made-by-moonlight/athene-cli@0.11.2

## 0.11.1

### Patch Changes

- ed7c6c7: fix: republish athene with correct athene-cli dependency (0.11.0 had workspace:\* dep bug)
- Updated dependencies [ed7c6c7]
  - @made-by-moonlight/athene-cli@0.11.1

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
  - @made-by-moonlight/athene-cli@0.11.0

## 0.10.1

### Patch Changes

- b7a5a64: Fix `npm install -g @made-by-moonlight/athene` failing with `EUNSUPPORTEDPROTOCOL workspace:*`.

  The publish script was calling `npm publish` directly, which does not understand pnpm's `workspace:*` protocol and published the literal string to npm. The fix uses `pnpm pack` to generate the tarball (which rewrites `workspace:*` to the resolved semver range) and then passes that tarball to `npm publish` for OIDC-authenticated upload.

## 0.10.0

### Patch Changes

- f5785e5: Fix global npm install broken by stale pre-rename package names

  `athene start` was failing with "Dependencies not installed" after `npm install -g` because two files still referenced the old short package names from before the `ao → athene` rename:
  - `packages/athene/bin/postinstall.js` looked for `@made-by-moonlight/cli`, `@made-by-moonlight/core`, and `@made-by-moonlight/web` — packages that no longer exist.
  - The published 0.9.2 `dist/lib/preflight.js` looked for `@made-by-moonlight/core` instead of `@made-by-moonlight/athene-core`.

  Updated `postinstall.js` to use the correct `athene-cli`, `athene-core`, and `athene-web` names. The CLI source (`preflight.ts`) was already correct and the fix will be included in the rebuilt dist.

- Updated dependencies [f5785e5]
- Updated dependencies [dc706d5]
  - @made-by-moonlight/athene-cli@0.10.0

## 0.9.2

### Patch Changes

- 2f9717f: Load agent-grok package metadata through JSON import attributes so packaged web and CLI runtimes do not keep a publish-host package.json lookup. This also raises the Node.js engine floor to 20.18.3+, where JSON modules with import attributes are non-experimental.
- Updated dependencies [2f9717f]
  - @made-by-moonlight/athene-cli@0.9.2

## 0.9.1

### Patch Changes

- 2d4c457: Fix canary nightly to include all publishable packages and fix Next.js import.meta.url build path issue
- Updated dependencies [2d4c457]
  - @made-by-moonlight/athene-cli@0.9.1

## 0.9.0

### Patch Changes

- d5d0f07: Rebuild missing better-sqlite3 native bindings during ao postinstall and replace noisy activity-events native-binding failures with a one-line diagnostic.
- Updated dependencies [6d48022]
- Updated dependencies [ecdf0c7]
- Updated dependencies [fcedb25]
- Updated dependencies [2980570]
- Updated dependencies [d5d0f07]
  - @made-by-moonlight/athene-cli@0.9.0

## 0.8.0

### Patch Changes

- @made-by-moonlight/athene-cli@0.8.0

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

- 7c46dc9: feat(release): weekly release train — channels, onboarding, dashboard banner, cron

  Ships the full release pipeline described in `release-process.html`:
  - **Cron-driven nightly canary.** `.github/workflows/canary.yml` triggers via
    `schedule: '0 18 * * 5,6,0,1,2'` (23:30 IST Fri–Tue) plus `workflow_dispatch`.
    Bake window (Wed–Thu) pauses scheduled nightlies; the captain re-cuts via
    workflow*dispatch when a fix lands. Stable `release.yml` publishes via
    `changesets/action`. `.changeset/config.json` adds the snapshot template
    (`{tag}-{commit}`). `@made-by-moonlight/athene-web` stays in the linked group and ships
    alongside `@made-by-moonlight/athene-cli` (it's a workspace:* runtime dep, so marking it
    private would 404 every `npm install -g @made-by-moonlight/athene` after publish).
    `scripts/check-publishable-deps.mjs` runs in both release.yml and canary.yml
    before the publish step and fails CI if a publishable package depends on a
    `private: true` package via workspace:\_.
  - **Update channels.** New `updateChannel` field in the global config schema
    (`stable | nightly | manual`, default `manual` so existing users see no
    surprise installs). `update-check.ts` reads `dist-tags[channel]` from the
    npm registry, compares prerelease versions segment-by-segment so SHA-suffixed
    nightlies sort correctly, and skips notices entirely on `manual`.
  - **Soft auto-install + active-session guard.** On stable/nightly, `athene update`
    skips the confirm prompt and just installs. Before installing it lists
    sessions and refuses with `N session(s) active. Run \`athene stop\` first.`if
any are in`working`/`idle`/`needs_input`/`stuck`. Same guard duplicated
in `POST /api/update` so the dashboard returns a structured 409.
  - **Onboarding question.** `athene start` prompts once for the channel if unset;
    dismissal persists `manual`. `athene config set updateChannel <value>` (and
    `installMethod`) lets users change it later.
  - **Dashboard banner.** `GET /api/version` reads the same cache file as the
    CLI. `UpdateBanner` (Tailwind only, `var(--color-*)` tokens) appears at the
    top of the dashboard when `isOutdated`. Click POSTs to `/api/update`;
    dismissal persists per-version in `localStorage`.
  - **Bun + Homebrew detection.** New install-method classifiers for
    `~/.bun/install/global/` (auto-installs `bun add -g @made-by-moonlight/athene@<channel>`)
    and `/Cellar/ao/` (notice only — `brew upgrade ao` to avoid clobbering
    brew's symlinks). `installMethod` config field overrides path detection.

  Supersedes #1525 (incorporates the canary + release infrastructure with the
  cron / no-stale-SHA-guard / no-merged-PR-comment modifications called out in
  the design doc).

### Patch Changes

- Updated dependencies [0f5ae0b]
- Updated dependencies [fe33bb7]
- Updated dependencies [7c46dc9]
  - @made-by-moonlight/athene-cli@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [0f539a3]
  - @made-by-moonlight/athene-cli@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [3a69722]
  - @made-by-moonlight/athene-cli@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [2306078]
- Updated dependencies [f09cc72]
- Updated dependencies [f330a1e]
- Updated dependencies [e1bb51f]
- Updated dependencies [f674422]
- Updated dependencies [e7ad928]
- Updated dependencies [4701122]
- Updated dependencies [c8af50f]
- Updated dependencies [bcdda4b]
- Updated dependencies [1cbf657]
  - @made-by-moonlight/athene-cli@0.4.0

## 0.2.2

### Patch Changes

- @composio/ao-cli@0.2.2

## 0.2.1

### Patch Changes

- ac625c3: Fix startup onboarding and install reliability:
  - Repair npm global install startup path by improving package resolution and web package discovery hints.
  - Make `athene start` prerequisite installs explicit and interactive for required tools (`tmux`, `git`) with clearer fallback guidance.
  - Keep `athene spawn` preflight check-only for `tmux` (no implicit install).
  - Remove redundant agent runtime re-detection during config generation.

- Updated dependencies [ac625c3]
  - @composio/ao-cli@0.2.1

## 0.2.0

### Minor Changes

- 3a650b0: Zero-friction onboarding: `athene start` auto-detects project, generates config, and launches dashboard — no prompts, no manual setup. Renamed npm package to `@composio/ao`. Made `@composio/ao-web` publishable with production entry point. Cross-platform agent detection. Auto-port-finding. Permission auto-retry in shell scripts.

### Patch Changes

- Updated dependencies [3a650b0]
  - @composio/ao-cli@0.2.0
