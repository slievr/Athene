import "server-only";

// This file is kept as a compatibility alias.
// New code should import from orchestrator-page-data.ts.
export {
  getOrchestratorPageData as getMetaPageData,
  type OrchestratorPageData as MetaPageData,
} from "./orchestrator-page-data";
