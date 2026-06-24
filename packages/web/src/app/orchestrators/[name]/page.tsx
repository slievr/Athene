import { notFound } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getOrchestratorPageData } from "@/lib/orchestrator-page-data";

export const dynamic = "force-dynamic";

export default async function OrchestratorPage(props: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await props.params;
  const data = await getOrchestratorPageData(name);

  if (!data) {
    notFound();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-canvas)]">
      <Dashboard
        initialSessions={data.sessions}
        projectName={name}
        projects={data.projects}
        orchestrators={[]}
        namedOrchestrators={data.orchestrators}
        metaOwner={name}
        attentionZones={data.attentionZones}
        dashboardLoadError={data.dashboardLoadError}
      />
    </div>
  );
}
