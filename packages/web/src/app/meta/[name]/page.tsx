import { notFound } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getMetaPageData } from "@/lib/meta-page-data";

export const dynamic = "force-dynamic";

export default async function MetaPage(props: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await props.params;
  const data = await getMetaPageData(name);

  if (!data) {
    notFound();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-canvas)]">
      <Dashboard
        initialSessions={data.sessions}
        projectName={`${name} (meta)`}
        projects={data.projects}
        orchestrators={[]}
        metaOrchestrators={data.metaOrchestrators}
        attentionZones={data.attentionZones}
        dashboardLoadError={data.dashboardLoadError}
      />
    </div>
  );
}
