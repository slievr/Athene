import { Suspense } from "react";
import type { Metadata } from "next";
import { FleetBoard } from "@/components/FleetBoard";
import { ViewTabBar } from "@/components/ViewTabBar";
import { getDashboardPageData } from "@/lib/dashboard-page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fleet — Athene",
};

export default async function FleetPage() {
  const pageData = await getDashboardPageData("all");

  return (
    <div className="dashboard-main--desktop">
      <div className="dashboard-main__subhead">
        <ViewTabBar />
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Suspense>
          <FleetBoard initialSessions={pageData.sessions} />
        </Suspense>
      </div>
    </div>
  );
}
