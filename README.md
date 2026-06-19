<h1 align="center">Athene — The Orchestration Layer for Parallel AI Agents</h1>

<div align="center">

Spawn parallel AI coding agents, each in its own git worktree. Agents autonomously fix CI failures, address review comments, and open PRs — you supervise from one dashboard.

[![GitHub stars](https://img.shields.io/github/stars/slievr/Athene?style=flat-square)](https://github.com/slievr/Athene/stargazers)
[![npm version](https://img.shields.io/npm/v/%40made-by-moonlight%2Fathene?style=flat-square)](https://www.npmjs.com/package/@made-by-moonlight/athene)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![PRs merged](https://img.shields.io/badge/PRs_merged-61-brightgreen?style=flat-square)](https://github.com/slievr/Athene/pulls?q=is%3Amerged)
[![Tests](https://img.shields.io/badge/test_cases-3%2C288-blue?style=flat-square)](https://github.com/slievr/Athene/releases/tag/metrics-v1)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/UZv7JjxbwG)

</div>

---

Athene manages fleets of AI coding agents working in parallel on your codebase. Each agent gets its own git worktree, its own branch, and its own PR. When CI fails, the agent fixes it. When reviewers leave comments, the agent addresses them. You only get pulled in when human judgment is needed.

**Agent-agnostic** (Claude Code, Codex, Aider) · **Runtime-agnostic** (tmux, ConPTY/process, Docker) · **Tracker-agnostic** (GitHub, Linear)

## Quick Start

> **Prerequisites:** [Node.js 20.18.3+](https://nodejs.org), [Git 2.25+](https://git-scm.com), [`gh` CLI](https://cli.github.com), and:
> - **macOS / Linux:** [tmux](https://github.com/tmux/tmux/wiki/Installing) — install via `brew install tmux` or `sudo apt install tmux`.
> - **Windows:** PowerShell 7+ recommended. tmux is **not** required — Athene uses native ConPTY via the `runtime-process` plugin (the default on Windows). Set `ATHENE_SHELL=bash` if you have Git Bash and prefer it (the legacy `AO_SHELL` is still honored).

### Install

```bash
npm install -g @made-by-moonlight/athene
```

> **Nightly builds** (latest `main`, daily Fri–Tue): `npm install -g @made-by-moonlight/athene@nightly`
> Back to stable: `npm install -g @made-by-moonlight/athene@latest`

<details>
<summary>Permission denied? npm warn allow-scripts? Install from source?</summary>

**Permission denied (EACCES):** prefix with `sudo` or [fix your npm permissions](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

**`npm warn allow-scripts` (npm 11+, ships with Node 23+):** Athene requires native modules (`node-pty`, `better-sqlite3`) that compile during install. If you see this warning and `athene start` fails, approve the install scripts once:

```bash
npm install -g @made-by-moonlight/athene --allow-scripts=@made-by-moonlight/athene,node-pty,better-sqlite3,sharp
```

Or approve them permanently for global installs:

```bash
npm config set allow-scripts=@made-by-moonlight/athene,node-pty,better-sqlite3,sharp --location=user
npm install -g @made-by-moonlight/athene
```

**Install from source (for contributors):**

```bash
git clone https://github.com/slievr/Athene.git
cd Athene && bash scripts/setup.sh
```
</details>

### Zsh Completion

Generate the completion file from the installed CLI:

```bash
mkdir -p ~/.zsh/completions
athene completion zsh > ~/.zsh/completions/_athene
```

Then make sure the directory is on your `fpath` before `compinit` runs:

```zsh
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit
compinit
```

For Oh My Zsh, install the same generated file into a custom plugin directory and add `athene` to your plugin list:

```bash
mkdir -p "${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/athene"
athene completion zsh > "${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/athene/_athene"
```

If you are contributing from a source checkout, you can also symlink the repo copy at [`completions/_athene`](completions/_athene).

### Start

Point it at any repo — it clones, configures, and launches the dashboard in one command:

```bash
athene start https://github.com/your-org/your-repo
```

Or from inside an existing local repo:

```bash
cd ~/your-project && athene start
```

That's it. The dashboard opens at `http://localhost:3000` and the orchestrator agent starts managing your project.

### Add more projects

```bash
athene start ~/path/to/another-repo
```

## How It Works

1. **You start** — `athene start` launches the dashboard and an orchestrator agent
2. **Orchestrator spawns workers** — each issue gets its own agent in an isolated git worktree
3. **Agents work autonomously** — they read code, write tests, create PRs
4. **Reactions handle feedback** — CI failures and review comments are automatically routed back to the agent
5. **You review and merge** — you only get pulled in when human judgment is needed

The orchestrator agent uses the [Athene CLI](docs/CLI.md) internally to manage sessions. You don't need to learn or use the CLI — the dashboard and orchestrator handle everything.

## Configuration

`athene start` auto-generates `agent-orchestrator.yaml` with sensible defaults. You can edit it afterwards to customize behavior:

```yaml
# agent-orchestrator.yaml
$schema: https://raw.githubusercontent.com/slievr/Athene/main/schema/config.schema.json
# Runtime data is auto-derived under ~/.agent-orchestrator/{hash}-{projectId}/
port: 3000

defaults:
  runtime: tmux       # default on macOS / Linux; on Windows the default is `process` (ConPTY)
  agent: claude-code
  workspace: worktree
  notifiers: [desktop]

projects:
  my-app:
    repo: owner/my-app
    path: ~/my-app
    defaultBranch: main
    sessionPrefix: app

reactions:
  ci-failed:
    auto: true
    action: send-to-agent
    retries: 2
  changes-requested:
    auto: true
    action: send-to-agent
    escalateAfter: 30m
  approved-and-green:
    auto: false # flip to true for auto-merge
    action: notify
```

CI fails → agent gets the logs and fixes it. Reviewer requests changes → agent addresses them. PR approved with green CI → you get a notification to merge.

Keep the `$schema` line so editors can autocomplete and validate against [`schema/config.schema.json`](schema/config.schema.json).

See [`agent-orchestrator.yaml.example`](agent-orchestrator.yaml.example) for the full reference, or run `athene config-help` for the complete schema.

## Remote Access

Athene keeps your Mac awake while running, so you can access the dashboard remotely (e.g., via Tailscale from your phone) without the machine going to sleep.

**How it works:** On macOS, Athene automatically holds an idle-sleep prevention assertion using `caffeinate`. When Athene exits, the assertion is released.

```yaml
# agent-orchestrator.yaml
$schema: https://raw.githubusercontent.com/slievr/Athene/main/schema/config.schema.json
power:
  preventIdleSleep: true  # Default on macOS; no-op on Linux and Windows
```

Set to `false` if you want to allow idle sleep while Athene runs.

**Lid-close limitation:** macOS enforces lid-close sleep at the hardware level — no userspace assertion can override it. If you need remote access while traveling with the lid closed, use [clamshell mode](https://support.apple.com/en-us/102505) (external power + display + input device).

**Linux / Windows:** Athene does not currently hold a wake assertion on these platforms. On Linux, idle-sleep behaviour is governed by your desktop environment / `systemd-logind`; configure that directly. On Windows, set the OS power plan if remote access matters while idle.

## Plugin Architecture

Seven plugin slots. Lifecycle stays in core.

| Slot      | Default     | Alternatives             |
| --------- | ----------- | ------------------------ |
| Runtime   | tmux (macOS/Linux) / process (Windows) | process, docker |
| Agent     | claude-code | codex, aider, cursor, opencode, kimicode |
| Workspace | worktree    | clone                    |
| Tracker   | github      | linear, gitlab           |
| SCM       | github      | gitlab                   |
| Notifier  | desktop     | slack, discord, composio, webhook, openclaw |
| Terminal  | iterm2      | web                      |

All interfaces defined in [`packages/core/src/types.ts`](packages/core/src/types.ts). A plugin implements one interface and exports a `PluginModule`. That's it.

## Why Athene?

Running one AI agent in a terminal is easy. Running 30 across different issues, branches, and PRs is a coordination problem.

**Without orchestration**, you manually: create branches, start agents, check if they're stuck, read CI failures, forward review comments, track which PRs are ready to merge, clean up when done.

**With Athene**, you: `athene start` and walk away. The system handles isolation, feedback routing, and status tracking. You review PRs and make decisions — the rest is automated.

## Documentation

| Doc                                      | What it covers                                               |
| ---------------------------------------- | ------------------------------------------------------------ |
| [Setup Guide](SETUP.md)                  | Detailed installation, configuration, and troubleshooting    |
| [CLI Reference](docs/CLI.md)             | All `athene` commands (mostly used by the orchestrator agent) |
| [Examples](examples/)                    | Config templates (GitHub, Linear, multi-project, auto-merge) |
| [Development Guide](docs/DEVELOPMENT.md) | Architecture, conventions, plugin pattern                    |
| [Contributing](CONTRIBUTING.md)          | How to contribute, build plugins, PR process                 |

## Development

```bash
pnpm install && pnpm build    # Install and build all packages
pnpm test                      # Run tests
pnpm dev                       # Start web dashboard dev server (Next.js HMR)
pnpm dev:cli                   # Watch-rebuild CLI + auto-restart athene start
```

**Dev vs. globally installed `athene`:** the dev version runs directly from `packages/cli/dist/index.js` — it does not replace your globally installed binary. `pnpm dev:cli` calls `node --watch packages/cli/dist/index.js start`, so it's isolated from any `athene` on your PATH. If you also have a global install and want to avoid confusion, either uninstall it first (`npm uninstall -g @made-by-moonlight/athene`) or always invoke the dev version explicitly:

```bash
node packages/cli/dist/index.js <command>
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for code conventions, watch-mode setup, and architecture details.

## Contributing

Contributions welcome. The plugin system makes it straightforward to add support for new agents, runtimes, trackers, and notification channels. Every plugin is an implementation of a TypeScript interface — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Development Guide](docs/DEVELOPMENT.md) for the pattern.

## License

MIT
