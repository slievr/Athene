import "server-only";

// This file is kept as a compatibility alias.
// New code should import from orchestrators.ts.
export {
  listSidebarOrchestrators as listSidebarMetaOrchestrators,
  type SidebarOrchestrator as SidebarMetaOrchestrator,
  type SidebarOrchestrator,
} from "./orchestrators";

// buildSidebarProjectOrchestrators is removed — it was only used by meta-page-data.ts
// which has been replaced by orchestrator-page-data.ts.
// Per-project orchestrators now appear in the project tree, not the sidebar section.
export type { SidebarProjectOrchestrator } from "@/components/SidebarOrchestrators";
