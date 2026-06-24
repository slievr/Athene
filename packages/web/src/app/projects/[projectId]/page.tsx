import { notFound } from "next/navigation";
import { DegradedProjectState } from "@/components/DegradedProjectState";
import { getProjectRouteData } from "@/lib/project-route-data";

export const dynamic = "force-dynamic";

export default async function ProjectPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await props.params;
  const routeData = await getProjectRouteData(projectId);

  if (!routeData) {
    notFound();
  }

  if (routeData.degradedProject) {
    return (
      <DegradedProjectState
        projectId={routeData.projectId}
        resolveError={routeData.degradedProject.resolveError}
        projectPath={routeData.degradedProject.path}
      />
    );
  }

  const { project } = routeData;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Path", value: project?.path ?? "" },
    { label: "Default branch", value: project?.defaultBranch ?? "" },
    ...(project?.repo ? [{ label: "Repository", value: project.repo }] : []),
    ...(project?.agent ? [{ label: "Agent", value: project.agent }] : []),
    ...(project?.runtime ? [{ label: "Runtime", value: project.runtime }] : []),
    ...(project?.tracker?.plugin ? [{ label: "Tracker", value: project.tracker.plugin }] : []),
    ...(project?.scm?.plugin ? [{ label: "SCM", value: project.scm.plugin }] : []),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-canvas)] p-6">
      <div className="flex flex-col gap-6 max-w-xl">
        <div>
          <h1 className="text-base font-semibold text-[--color-text-primary] mb-1">
            {project?.name ?? projectId}
          </h1>
          <p className="text-xs text-[--color-text-tertiary] font-mono">{projectId}</p>
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[--color-text-tertiary]">
            Configuration
          </h2>
          <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-4">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-3">
                <span className="text-xs text-[--color-text-secondary] w-32 shrink-0">{label}</span>
                <span className="text-xs text-[--color-text-primary] font-mono break-all">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
