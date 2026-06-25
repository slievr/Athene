---
"@made-by-moonlight/athene-web": minor
"@made-by-moonlight/athene-core": minor
---

Orchestrator management, spawn fix, and version display.

**Orchestrator management (PR #62):**
- UUID-based orchestrator identity — stable UUIDs as config `id` field, URLs change from `/orchestrators/<slug>` to `/orchestrators/<uuid>`
- Inline settings bar: editable display label, directory scope picker, discovery toggle, delete with session cleanup
- Session labels: inline rename on kanban cards persists as `displayName`
- `OrchestratorScope` now stores directory paths (`string[]`) instead of project IDs; startup migration runs automatically
- New API: `PATCH /api/orchestrators/[id]`, `DELETE /api/orchestrators/[id]`, `PATCH /api/sessions/[id]`

**Spawn fix (PR #65):** Allow spawning into projects not yet tracked by the lifecycle supervisor.

**Version display (PR #66):** Show installed Athene version in the sidebar settings popover.
