# @made-by-moonlight/athene-plugin-notifier-dashboard

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

- 2980570: Add the notifier test harness, dashboard notifications, and desktop notifier setup.
- Updated dependencies [73bed33]
- Updated dependencies [a610601]
- Updated dependencies [7d9b862]
- Updated dependencies [6d48022]
- Updated dependencies [fcedb25]
- Updated dependencies [94981dc]
- Updated dependencies [2980570]
- Updated dependencies [d5d0f07]
  - @made-by-moonlight/athene-core@0.9.0
