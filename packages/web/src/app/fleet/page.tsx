import { Suspense } from "react";
import type { Metadata } from "next";
import { FleetBoard } from "@/components/FleetBoard";
import { getDashboardPageData } from "@/lib/dashboard-page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fleet — Athene",
};

export default async function FleetPage() {
  const pageData = await getDashboardPageData("all");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[--color-background]">
      <Suspense>
        <FleetBoard initialSessions={pageData.sessions} />
      </Suspense>
    </div>
  );
}
