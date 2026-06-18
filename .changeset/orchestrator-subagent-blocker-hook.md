---
"@made-by-moonlight/athene-plugin-agent-claude-code": patch
---

fix(agent-claude-code): block native subagent dispatch in orchestrator sessions

Ship a PreToolUse hook (`subagent-blocker.cjs`) that deterministically blocks
native Claude `Task`/`Agent` subagent dispatch in orchestrator sessions, turning
the prompt-only rule into an enforced guard. The hook is installed in every
workspace but runtime-gated to `AO_CALLER_TYPE === "orchestrator"`, so worker
sessions are unaffected. Read-only Explore/Plan investigation agents are still
permitted; everything else must go through `ao spawn`.
