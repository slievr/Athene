---
name: spawn-worker
description: Use when running as an orchestrator inside Athene and any implementation, investigation, monitoring, or multi-step task needs to be delegated — code changes, CI watching, PR creation, branch pushes, or any task that could run independently.
---

# Spawn a Worker, Not a Subagent

## The Rule

> **Implementation work goes to Athene workers. Orchestrators coordinate.**

When you need to delegate any task, spawn an Athene worker via the CLI:

```bash
node /home/slievr/proj/Athene/packages/cli/dist/index.js spawn \
  --prompt "your task description here"
```

Or if `athene` is in PATH:

```bash
athene spawn --prompt "your task description here"
```

**Never use the Agent tool to delegate work in an Athene session.** The Agent tool spawns an ephemeral subprocess inside your own context — it is not an Athene worker, has no worktree, has no session, and is invisible to the dashboard.

## What Workers Get That Subagents Don't

| | Athene worker | Agent tool subagent |
|---|---|---|
| Isolated git worktree | ✅ | ❌ |
| Visible in dashboard | ✅ | ❌ |
| Persistent session ID | ✅ | ❌ |
| Can push / create PRs | ✅ | ❌ (no auth wiring) |
| Survives orchestrator context reset | ✅ | ❌ |
| Tracked by lifecycle manager | ✅ | ❌ |

## When to Spawn a Worker

Spawn a worker for anything that involves:
- Writing, editing, or fixing code
- Running tests, typechecks, or builds
- Pushing a branch or creating a PR
- Watching CI and fixing failures
- Any investigation that might lead to code changes
- Any task that takes more than a few bash commands

Keep in the orchestrator conversation only: coordination, routing decisions, reading status, talking to the user.

## Writing a Good Prompt

The worker starts cold — give it everything it needs:

```bash
athene spawn --prompt "Watch PR #11 (https://github.com/slievr/Athene/pull/11) for CI
failures. Poll \`gh pr checks 11 --repo slievr/Athene\` every 90 seconds. If a check
fails, fetch logs with \`gh run view <id> --log-failed\`, investigate root cause in
/home/slievr/proj/Athene on branch feat/parliament, fix it, run
\`pnpm --filter @made-by-moonlight/athene-web test\`, commit and push.
Known flakes to ignore: the 2 WebSocket tests in direct-terminal-ws.integration.test.ts.
Report when CI is green."
```

Prompt must include:
- Repo path and branch
- Exact task with acceptance criteria
- Any known invariants to preserve
- What to report back

## Rationalization Red Flags

These thoughts mean STOP — you're about to use the Agent tool when you shouldn't:

| Thought | Reality |
|---|---|
| "The task is small" | Size doesn't matter. Workers handle small tasks fine. |
| "I'm already mid-context" | That's the point — offload work to preserve orchestrator context. |
| "It's just a push/PR creation" | Pushes need auth wiring that subagents don't have. Use a worker. |
| "I need the result quickly" | Workers report back. Use `run_in_background: true` on Agent only for true one-liner lookups that don't touch files or git. |
| "The Agent tool is easier to reach" | It's always easier. That's why this rule exists. |

## The Only Valid Use of the Agent Tool

The Agent tool is acceptable for **read-only lookups** that:
- Touch no files
- Touch no git
- Return a single answer (e.g. "what does this function do?", "find where X is defined")

Everything else → `athene spawn`.
