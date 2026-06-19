# AO CLI Reference

The `ao` CLI is the control interface for Athene. Most commands are used by the **orchestrator agent itself** to manage sessions, not by humans directly. Humans typically only need `athene start` and the web dashboard.

## Commands humans use

```bash
athene start                               # Auto-detect, generate config, start dashboard + orchestrator
athene start <url>                         # Clone repo, auto-configure, and start
athene start ~/other-repo                  # Add a new project and start
athene stop                                # Stop everything (dashboard, orchestrator, lifecycle worker)
athene status                              # Overview of all sessions
athene status --watch                      # Live-updating terminal status view
athene dashboard                           # Open web dashboard in browser
athene setup dashboard                     # Configure dashboard notification retention/routing
athene setup desktop                       # Install/configure native macOS desktop notifications
athene notify test --to desktop            # Send a manual notifier test without starting AO
athene completion zsh                      # Print the zsh completion script
```

## Commands the orchestrator agent uses

These are primarily invoked by the orchestrator agent running inside a runtime session (a tmux window on macOS/Linux; a ConPTY pty-host on Windows). You can use them manually if needed, but the orchestrator handles this automatically.

```bash
athene spawn [issue]                       # Spawn an agent (project auto-detected from cwd)
athene spawn 123 --agent codex             # Override agent for this session
athene batch-spawn 101 102 103             # Spawn agents for multiple issues at once
athene send <session> "Fix the tests"      # Send instructions to a running agent
athene session ls                          # List active sessions (terminated hidden)
athene session ls --include-terminated     # Include killed/done/merged/errored/cleanup sessions
athene session ls --json                   # Machine-readable session inventory (see note below)
athene session kill <session>              # Kill a session
athene session restore <session>           # Revive a crashed agent
```

> **JSON output:** `athene session ls --json` and `athene status --json` emit
> `{ "data": [...], "meta": { "hiddenTerminatedCount": N } }`. Terminated sessions
> (`killed`, `terminated`, `done`, `merged`, `errored`, `cleanup`) are filtered from
> `data` by default; `meta.hiddenTerminatedCount` reports how many were dropped.
> Pass `--include-terminated` to include them and reset the count to `0`.

## Maintenance commands

```bash
athene doctor                              # Check install, runtime, and stale temp issues
athene doctor --fix                        # Apply safe fixes automatically
athene setup openclaw                      # Connect AO notifications to OpenClaw
athene update                              # Update local AO install (source installs only)
athene config-help                         # Show full config schema reference
```

## Zsh completion

```bash
mkdir -p ~/.zsh/completions
athene completion zsh > ~/.zsh/completions/_ao
```

Add the directory to `fpath` before running `compinit`:

```zsh
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit
compinit
```

With Oh My Zsh, write the generated file to `${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/ao/_ao`
and add `ao` to the `plugins=(...)` list in `~/.zshrc`.

`athene doctor` checks PATH and launcher resolution, required binaries, configured plugin resolution, terminal-runtime health (tmux on Unix; PowerShell / `runtime-process` on Windows), GitHub CLI health, config support directories, stale AO temp files, and core build/runtime sanity. Runs and is supported on macOS, Linux, and Windows.

`athene update` fast-forwards the local install on `main`, reinstalls dependencies, clean-rebuilds core packages, refreshes the launcher, and runs smoke tests. Works on macOS, Linux, and Windows (Windows uses the bundled `athene-update.ps1` script automatically). Use `athene update --skip-smoke` to stop after rebuild, or `athene update --smoke-only` to rerun just the smoke checks.

## Multi-Project Rollout

Portfolio mode is enabled by default. Users do not need to set `ATHENE_ENABLE_PORTFOLIO` unless they explicitly want to disable portfolio/project-management flows.
