import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { ProjectLayoutClient } from "../projects/[projectId]/project-layout-client";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const pageData = await getDashboardPageData("all");

  return (
    <ProjectLayoutClient
      initialSessions={pageData.sessions}
      initialProjects={pageData.projects}
      initialOrchestrators={pageData.orchestrators}
      initialNamedOrchestrators={pageData.namedOrchestrators}
    >
      {children}
    </ProjectLayoutClient>
  );
}
