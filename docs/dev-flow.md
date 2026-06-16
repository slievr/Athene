# Local Development Flow

Practical guide for contributors actively working on this codebase.

---

## 1. Starting the Full Dev Environment

### One-time setup

```bash
pnpm install
pnpm build          # required before first dev start — builds all packages
```

### Daily dev start

```bash
cd packages/web
pnpm dev
```

`pnpm dev` (defined in `packages/web/package.json`) runs two processes in parallel via `concurrently`:

| Process | Command | What it does |
|---------|---------|--------------|
| `dev:next` | `next dev -p 3000` | Next.js dev server with HMR — serves the dashboard on `http://localhost:3000` |
| `dev:direct-terminal` | `tsx watch server/direct-terminal-ws.ts` | WebSocket server for xterm.js terminal connections (port `DIRECT_TERMINAL_PORT`, default 14801). Uses `tsx watch` for auto-restart on file changes; falls back to non-watch mode if tsx IPC setup fails (see `scripts/dev-direct-terminal.mjs`). |

**The CLI (`athene start`) is a separate concern.** It is not started by `pnpm dev`. Run `athene start` in a separate shell when you need the full orchestrator runtime.

### What each server does

- **Next.js (port 3000):** Serves the React dashboard, API routes (`/api/*`), and SSE streams. Hot-reloads React components and API routes automatically.
- **Direct terminal WS (port 14801):** Handles raw terminal I/O between the browser's xterm.js and tmux/process sessions. Separate from Next.js because WebSocket upgrades with large PTY streams don't fit cleanly into Next.js server handlers.

---

## 2. Running Tests

### Unit tests (all packages except web)

```bash
pnpm test                                          # run once, all packages
pnpm --filter @made-by-moonlight/athene-core test  # single package
pnpm --filter @made-by-moonlight/athene-core test -- --watch  # watch mode
```

The root `pnpm test` excludes `@made-by-moonlight/athene-web` intentionally — web tests use jsdom and React and are slow as part of the recursive run.

### Web tests

```bash
pnpm --filter @made-by-moonlight/athene-web test        # run once
pnpm --filter @made-by-moonlight/athene-web test:watch  # watch mode
```

Web tests use Vitest with jsdom + @testing-library/react. The `vitest.config.ts` in `packages/web` aliases workspace packages directly to their source files, so **you don't need to rebuild packages to run web tests** — Vitest resolves TypeScript source directly.

### Integration tests

```bash
pnpm test:integration
```

These require real binaries (tmux, git) and hit the actual filesystem. Run them before merging changes to session lifecycle, workspace, or agent-plugin code. They're slower and not part of the main `pnpm test`.

---

## 3. Typechecking and Linting

### Typecheck everything

```bash
pnpm typecheck        # runs tsc --noEmit in every package
```

### Typecheck a single package

```bash
pnpm --filter @made-by-moonlight/athene-core typecheck
pnpm --filter @made-by-moonlight/athene-web typecheck
pnpm --filter @made-by-moonlight/athene-cli typecheck
```

Web typecheck uses `tsconfig.json` (which enables `incremental`), so repeated runs are fast. Core typecheck runs `tsc --noEmit` independently.

### Lint

```bash
pnpm lint           # ESLint on all files
pnpm lint:fix       # auto-fix what's fixable
pnpm format         # Prettier on all files
pnpm format:check   # check only (used in CI)
```

ESLint uses a flat config (`eslint.config.js` at the root). Key enforced rules: no `any`, consistent type imports, no `eval`, `prefer-const`. Tests relax `any` and `console.log`.

---

## 4. Building Only What You Need

### Build everything (safe default before a PR)

```bash
pnpm build
```

This runs `pnpm -r build` — builds every package in dependency order.

### Build order matters

```
core → plugins → cli, web (parallel)
```

If you change `packages/core`, you must rebuild it before changes are visible to cli, web, or plugins:

```bash
pnpm --filter @made-by-moonlight/athene-core build
```

### Build a single plugin

```bash
pnpm --filter @made-by-moonlight/athene-plugin-agent-claude-code build
```

### Build web only (after core and plugins are current)

```bash
pnpm --filter @made-by-moonlight/athene-web build
```

### How each package builds

| Package | Build tool | Output |
|---------|-----------|--------|
| `core` | Rollup (via `rollup.config.ts`) | `dist/` — ES modules, preserves module structure |
| Plugins | `tsc` | `dist/` — ES modules |
| `cli` | `tsc` + asset copy | `dist/` — ES modules; copies `src/assets/` |
| `web` | `next build` + `tsc -p tsconfig.server.json` | `.next/` + `dist-server/` |

---

## 5. Common Friction Points

### Stale core build

**Symptom:** You edit `packages/core/src/types.ts`, reload the web dashboard, and your changes aren't reflected.

**Why:** Next.js and plugins import from `packages/core/dist/` (the compiled output). Source edits don't propagate until core is rebuilt.

**Fix:** `pnpm --filter @made-by-moonlight/athene-core build`, then restart `pnpm dev`.

**Better fix for frequent core edits:** Open a second terminal with `pnpm --filter @made-by-moonlight/athene-core build -- --watch` (Rollup watch mode) so core rebuilds on every save. Next.js will pick up the new `dist/` files on the next request.

### Web test aliases bypass the build

This is actually a feature: `packages/web/vitest.config.ts` aliases all `@made-by-moonlight/*` imports directly to source TypeScript files. Web tests always reflect the latest source without a build step — but this also means they won't catch problems with the build output itself. If you suspect a build-time issue, run `pnpm build` and then do an end-to-end sanity check.

### Missing `.js` extension errors at runtime

ESM requires explicit `.js` extensions on local imports. If you add a new file and forget the extension in the import, the error appears at runtime, not at typecheck. The TypeScript config (`module: "Node16"`) catches most of these, but double-check new imports.

### `pnpm build` guard on web

`packages/web/package.json` has a `prebuild` script that runs `scripts/guard-production-artifact-clean.mjs`. If `.next/` or `dist-server/` are present and look like production artifacts, the guard may block the build. Run `pnpm --filter @made-by-moonlight/athene-web clean` first if you hit this.

### Integration tests need real tmux

Integration tests spawn actual tmux sessions. They will fail in environments without tmux (or on Windows, where the process runtime is used instead). If you're on Windows and the integration suite is failing, check whether the specific tests use tmux-specific APIs.

---

## 6. Fastest Inner Loop by Task Type

### Editing a web component

1. `pnpm build` (once, if you haven't already today)
2. `cd packages/web && pnpm dev` — leave running
3. Edit component in `packages/web/src/components/`
4. Browser auto-reloads via Next.js HMR
5. Run component tests as you go: `pnpm --filter @made-by-moonlight/athene-web test:watch`
6. Before committing: `pnpm typecheck && pnpm lint`

If the component uses types from `core` that you also changed: rebuild core first (step 1 handles this).

### Editing core types or services

1. `pnpm --filter @made-by-moonlight/athene-core build` — rebuild core
2. If the web dashboard needs to reflect it: restart `pnpm dev`
3. Run core tests: `pnpm --filter @made-by-moonlight/athene-core test -- --watch`
4. Before committing: `pnpm typecheck && pnpm lint`

For rapid core iteration, keep Rollup watch running in a second terminal:
```bash
# Terminal 1: core watch
cd packages/core && npx rollup -c rollup.config.ts --watch

# Terminal 2: web dev (restarts pick up new core dist)
cd packages/web && pnpm dev

# Terminal 3: core tests in watch mode
pnpm --filter @made-by-moonlight/athene-core test -- --watch
```

### Editing a plugin

1. `pnpm --filter @made-by-moonlight/athene-plugin-<name> build`
2. If the CLI needs the updated plugin: `pnpm --filter @made-by-moonlight/athene-cli build`
3. Test: `pnpm --filter @made-by-moonlight/athene-plugin-<name> test -- --watch`

Most plugin tests mock external dependencies (tmux, APIs, file I/O). If your change requires real binaries, add an integration test.

### Editing CLI commands

CLI is built with `tsc` to `dist/`. The root `dev:start` script runs the compiled CLI with `--watch`:

```bash
# From root — runs built CLI with Node.js file watcher (auto-restarts on dist/ changes)
pnpm dev:start
```

But this requires the CLI to already be built. Typical flow:

```bash
pnpm --filter @made-by-moonlight/athene-cli build   # initial build
pnpm dev:start                                       # watch the dist
```

Alternatively, run the CLI directly via `tsx` (no build step):

```bash
cd packages/cli && npx tsx src/index.ts <command>
```

### Pre-push checklist

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Run these in order. `pnpm build` must come first because `typecheck` and `test` in some packages import from `dist/`.

---

## 7. Environment Variables for Development

```bash
PORT=3000                    # Next.js port (default: 3000)
DIRECT_TERMINAL_PORT=14801   # Terminal WebSocket port (default: 14801)
AO_LOG_LEVEL=debug           # Verbose orchestrator logging
GITHUB_TOKEN=ghp_...         # Required for GitHub integration
ANTHROPIC_API_KEY=sk-ant-... # Required for Claude Code agent
```

Store in `packages/web/.env.local` (gitignored). Never commit real values.
