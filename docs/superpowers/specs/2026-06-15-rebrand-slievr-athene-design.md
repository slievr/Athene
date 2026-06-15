# Plan: Rebrand the `ao` fork (Athene) into an independently-publishable package

## Context

The user forked `ComposioHQ/agent-orchestrator` to `slievr/Athene` so they can change
features to suit their workflow. The fork is currently a faithful copy of upstream — the
name "Athene" appears **0 times** in the code; only the GitHub repo was renamed. It is a
pnpm monorepo of ~32 version-linked packages under the `@aoagents/*` scope, CLI binary `ao`,
published via changesets.

Goal: make it fully their own — rename the npm scope **and** the internal package leaves
(drop the `ao-` prefix so anything can be reshaped), rename the CLI binary to `athene`, and
publish it to npm from a GitHub Actions workflow in their fork. The renamed CLI must
**coexist with the upstream `ao`** the user is actively running for their portfolio, by
reusing the same on-disk state.

## Locked decisions

- **Scope + leaves:** `@aoagents/ao` → `@made-by-moonlight/athene` (umbrella); `@aoagents/ao-cli` →
  `@made-by-moonlight/athene-cli`; `@aoagents/ao-core` → `@made-by-moonlight/athene-core`; `@aoagents/ao-web` → `@made-by-moonlight/athene-web`;
  `@aoagents/ao-notifier-macos` → `@made-by-moonlight/athene-notifier-macos`; `@aoagents/ao-integration-tests`
  → `@made-by-moonlight/athene-integration-tests`; `@aoagents/ao-website` → `@made-by-moonlight/athene-website`;
  `@aoagents/ao-plugin-*` → `@made-by-moonlight/athene-plugin-*` (25 plugins).
- **Binary:** `ao` → `athene`.
- **Publish:** GitHub Actions in `slievr/Athene` using a `@slievr` npm org + `NPM_TOKEN`.
- **DO NOT CHANGE (data/compat):** `~/.agent-orchestrator/`, per-repo `agent-orchestrator.yaml`
  / `.yml`, `~/.ao/bin/`, `{workspace}/.ao/`, `~/.cache/ao/`, and the `AO_*` env vars
  (`AO_GLOBAL_CONFIG`, `AO_SESSION_ID`, …). These are user state and cross-tool compatibility
  surfaces; keeping them verbatim is what lets `athene` reuse the existing portfolio config.

## Implementation

### 0. Prerequisite (user action, before publish)
- Create/own the `@slievr` org on npmjs.com and generate an automation token (stored as the
  `NPM_TOKEN` GitHub Actions secret in `slievr/Athene`). Renaming can proceed locally without it.

### 1. Mechanical scope+leaf rename (bulk, ordered)
Run ordered string replacements across the repo (exclude `.git`, `node_modules`, `dist`,
`.next`, `pnpm-lock.yaml`), **longest-match first** to avoid partial collisions:
1. `@aoagents/ao-plugin-` → `@made-by-moonlight/athene-plugin-`
2. `@aoagents/ao-cli` → `@made-by-moonlight/athene-cli`
3. `@aoagents/ao-core` → `@made-by-moonlight/athene-core`
4. `@aoagents/ao-web` → `@made-by-moonlight/athene-web`
5. `@aoagents/ao-notifier-macos` → `@made-by-moonlight/athene-notifier-macos`
6. `@aoagents/ao-integration-tests` → `@made-by-moonlight/athene-integration-tests`
7. `@aoagents/ao-website` → `@made-by-moonlight/athene-website`
8. `@aoagents/ao` → `@made-by-moonlight/athene`  (umbrella; safe only after the above)
9. Sweep for any residual `@aoagents/` → fail the run if found.

This covers: all `package.json` `name` + `workspace:*` deps (32 files), 283 TS imports
(incl. subpath exports like `@made-by-moonlight/athene-core/types`, `/utils`, `/scm-webhook-utils`), vitest
aliases (`packages/web/vitest.config.ts`, `packages/core/vitest.config.ts`),
`.changeset/config.json` `linked`/`ignore` arrays, root `package.json` scripts, and docs.

Package **directory** names already lack the `ao-` prefix (`packages/cli`, `packages/core`,
`packages/plugins/tracker-linear`, …) so they need no rename. Optionally rename
`packages/athene/` → `packages/athene/` for clarity (low value; keep to reduce churn).

### 2. Split scope/leaf references (NOT caught by step 1 — must be done explicitly)
These pass scope and leaf as separate args or hardcode a leaf string:
- `packages/core/src/plugin-registry.ts` — `BUILTIN_PLUGINS` (25 entries `pkg: "@aoagents/ao-plugin-*"` → `"@made-by-moonlight/athene-plugin-*"`). Caught by step 1 (full strings), but verify.
- `packages/cli/src/lib/preflight.ts:37` — `findPackageUp(webDir, "@aoagents", "ao-core")` → `("@slievr", "core")`.
- `packages/cli/src/assets/scripts/athene-doctor.sh:450-484` — `findPackageUp/resolveNodeModulesPackage(repoRoot, "@aoagents", "ao-core"|"ao-web")` → `"@slievr","core"|"web"`.
- `packages/core/src/daemon-children.ts:417` — returns literal `"ao-web"` → `"web"`.
- `packages/core/src/update-cache.ts` — `getInstalledAoVersion()` candidates `@aoagents/ao/package.json`, `@aoagents/ao-cli`, `@aoagents/ao-web` → `@made-by-moonlight/athene`, `@made-by-moonlight/athene-cli`, `@made-by-moonlight/athene-web`. Keep cache path `~/.cache/ao/` (compat).
- `packages/athene/bin/postinstall.js` — `findPackageUp(__dirname, "@aoagents", "ao-web"|"ao-cli")` and better-sqlite3/`@made-by-moonlight/athene-core` lookups → update scope + leaf.
- `scripts/rebuild-node-pty.js` — `@aoagents/ao-web`, `@aoagents/ao-cli` lookups → `@made-by-moonlight/athene-web`, `@made-by-moonlight/athene-cli`.

### 3. External-plugin name regex
- `packages/core/src/config.ts:427` regex `^ao-plugin-(?:runtime|agent|workspace|tracker|scm|notifier|terminal)-(.+)$` derives a plugin's short name from its package name. Built-ins are unaffected (hardcoded list), but to support future `@made-by-moonlight/athene-plugin-*` plugins, broaden to `^(?:ao-)?plugin-(?:runtime|agent|workspace|tracker|scm|notifier|terminal)-(.+)$` (accept both old and new prefixes). Update the adjacent comments/examples.

### 4. Binary rename `ao` → `athene`
- `bin` field in `packages/athene/package.json` and `packages/cli/package.json`: `"ao"` → `"athene"`.
- Rename shim `packages/athene/bin/ao.js` → `bin/athene.js` (content: `import "@made-by-moonlight/athene-cli"`); update the `bin` path.
- `completions/_ao` → `completions/_athene`; update `#compdef ao` → `#compdef athene` and `ao completion zsh` → `athene completion zsh`.
- **Embedded agent command strings (~48):** replace `ao <subcommand>` → `athene <subcommand>`
  in `packages/core/src/prompt-builder.ts` (primary, ~18) and across core
  (`agent-report.ts`, `code-review-manager.ts`, `lifecycle-manager.ts`, `config.ts`,
  `query-activity-events.ts`, `types.ts`, `windows-pty-registry.ts`, `daemon-children.ts`,
  `global-config.ts`, `recovery/manager.ts`) plus `packages/cli/src/commands/update.ts`
  (`ao stop|start|update|--version`). **Surgical:** only replace command invocations
  (backtick/quote-delimited `` `ao ` ``, `"ao "`). Do NOT touch `~/.agent-orchestrator`,
  `~/.ao`, `agent-orchestrator.yaml`, or `~/.cache/ao` (preserve list from decisions).
- Update `prompt-builder.test.ts` expectation (`ao send …` → `athene send …`).

### 5. CI + publish workflow (GitHub Actions in the fork)
- Update scope filters in `.github/workflows/*.yml` (`ci.yml`, `release.yml`, `canary.yml`):
  `@aoagents/ao-web` → `@made-by-moonlight/athene-web`; version-source path `packages/athene/package.json` stays
  (dir unchanged) but the package name it reads is now `@made-by-moonlight/athene`.
- Replace upstream's two-stage private-server publish with a self-contained release job:
  use `changesets/action@v1` with `publish: pnpm release` (root `release` script already does
  `pnpm -r build && changeset publish`), `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, on
  push to `main`. `.npmrc` (`access=public`) and per-package `publishConfig.access=public`
  already correct. Keep `provenance: true` only if publishing from CI with OIDC; otherwise
  drop it to avoid first-publish failures.

### 6. Rebuild + validate
- `pnpm install` (regenerates `pnpm-lock.yaml` with new names), `pnpm -r build`,
  `pnpm typecheck`, `pnpm -r --filter '!@made-by-moonlight/athene-web' test`.

## Critical files
- All 32 `package.json` (names + `workspace:*` deps) and `.changeset/config.json`.
- `packages/core/src/plugin-registry.ts`, `config.ts` (regex), `update-cache.ts`,
  `daemon-children.ts`, `prompt-builder.ts`.
- `packages/cli/src/lib/preflight.ts`, `packages/cli/src/commands/update.ts`,
  `packages/cli/src/assets/scripts/athene-doctor.sh`.
- `packages/athene/package.json` + `bin/athene.js` + `bin/postinstall.js`; `packages/cli/package.json`.
- `scripts/rebuild-node-pty.js`, `completions/_athene`, `.github/workflows/*.yml`.

## Verification (end-to-end)
1. `grep -rn "@aoagents" --include='*.ts' --include='*.json' --include='*.sh' .` (excl. node_modules/dist) returns **0**.
2. `pnpm install && pnpm -r build && pnpm typecheck && pnpm -r --filter '!@made-by-moonlight/athene-web' test` all pass.
3. Local CLI smoke test: from a global link of the built umbrella, `athene --version` prints
   the version; `athene status` reads the existing `~/.agent-orchestrator/` state (proves
   data-path compatibility / coexistence with `ao`).
4. Plugin resolution: `athene doctor` reports built-in plugins resolve (validates step 2/3).
5. Publish dry run: `pnpm -r build && pnpm changeset publish --dry-run` (or a CI run on a
   throwaway changeset) shows `@made-by-moonlight/*` packages targeted, none `@aoagents`.
6. After first real publish: `npm i -g @made-by-moonlight/athene` on a clean machine → `athene` works.

## Risks & follow-ups
- **npm org/token must exist before the publish job runs** (else CI publish fails). Renaming
  + build can be validated without it.
- **node-pty / better-sqlite3 native rebuilds** run in `postinstall`; failures are non-fatal
  (warn). Verify the updated scope/leaf lookups find the packages so rebuilds still trigger.
- **`provenance: true`** requires CI OIDC; for a first manual/Actions publish, drop it if it
  blocks, re-enable once the pipeline is trusted.
- **Existing portfolio orchestratorRules say `ao spawn`** (the 14 repos + `ao-meta` we set
  up). They keep working while upstream `ao` stays installed (same data dir). Follow-up once
  cutting over to `athene`: bulk-update those rules `ao ` → `athene ` (and the `~/proj/README.md`).
- Keep `repository`/`homepage` URLs pointing at `slievr/Athene` (cosmetic; not required for publish).
