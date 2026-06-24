"use client";

import type { DashboardSession } from "@/lib/types";
import { SessionCard } from "./SessionCard";
import { getOrchestratorDotClass, getOrchestratorBorderClass } from "@/lib/orchestrator-colors";

export interface OrchestratorGroupData {
  parentSessionId: string;
  orchestratorName: string;
  spawnedAt: string | null; // ISO string
  sessions: DashboardSession[];
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  group: OrchestratorGroupData;
}

export function OrchestratorGroup({ group }: Props) {
  const dotClass = getOrchestratorDotClass(group.parentSessionId);
  const borderClass = getOrchestratorBorderClass(group.parentSessionId);

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-1 py-1 mb-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-xs font-semibold text-[--color-text-secondary]">
          {group.orchestratorName}
        </span>
        <span className="text-[--color-text-tertiary] text-xs">·</span>
        <span className="text-xs text-[--color-text-tertiary]">
          {formatRelativeTime(group.spawnedAt)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {group.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            accentClass={borderClass}
          />
        ))}
      </div>
    </div>
  );
}
