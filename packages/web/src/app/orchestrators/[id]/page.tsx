import { notFound } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getOrchestratorPageData } from "@/lib/orchestrator-page-data";
import { orchestratorSessionPath } from "@/lib/routes";
import { OrchestratorSpawnForm } from "@/components/OrchestratorSpawnForm";
import { OrchestratorSettingsBar } from "@/components/OrchestratorSettingsBar";

export const dynamic = "force-dynamic";

export default async function OrchestratorPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const data = await getOrchestratorPageData(id);

  if (!data) {
    notFound();
  }

  const ownSession = data.orchestrators.find((o) => o.id === id)?.session ?? null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-canvas)]">
      {ownSession && (
        <div className="orchestrator-terminal-bar flex items-center gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-4 py-2">
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            Orchestrator session:
          </span>
          <a
            href={orchestratorSessionPath(id, ownSession.id)}
            className="flex items-center gap-1.5 text-[12px] font-mono text-[var(--color-text-primary)] hover:underline"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="m8 10 3 3-3 3" />
              <path d="M13 16h3" />
            </svg>
            {data.id}
          </a>
        </div>
      )}
      <OrchestratorSettingsBar
        orchId={id}
        currentLabel={data.label}
        currentScope={data.scope}
        currentDiscover={data.discover}
        projects={data.projects}
        sessionCount={data.sessions.length}
      />
      {data.projects.length > 0 && (
        <OrchestratorSpawnForm orchestratorName={data.slug} projects={data.projects} />
      )}
      <Dashboard
        initialSessions={data.sessions}
        projectName={data.label}
        projects={data.projects}
        orchestrators={[]}
        namedOrchestrators={data.orchestrators}
        metaOwner={data.slug}
        attentionZones={data.attentionZones}
        dashboardLoadError={data.dashboardLoadError}
      />
    </div>
  );
}
