"use client";

import { OrchestratorGroup, type OrchestratorGroupData } from "./OrchestratorGroup";
import type { AttentionLevel } from "@/lib/types";

const INDICATOR_CLASSES: Record<AttentionLevel, string> = {
  working: "bg-[var(--color-status-working)]",
  action:  "bg-[var(--color-status-attention)]",
  respond: "bg-[var(--color-status-respond)]",
  review:  "bg-[var(--color-status-review)]",
  pending: "bg-[var(--color-status-pending)]",
  merge:   "bg-[var(--color-status-merge)]",
  done:    "bg-[var(--color-status-done)]",
};

interface Props {
  title: string;
  groups: OrchestratorGroupData[];
  attentionLevel: AttentionLevel;
}

export function FleetColumn({ title, groups, attentionLevel }: Props) {
  const totalSessions = groups.reduce((sum, g) => sum + g.sessions.length, 0);

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] mr-3 last:mr-0">
      <div className="flex items-center gap-1.5 px-1 pb-2.5 mb-3 border-b border-[--color-border-default]">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${INDICATOR_CLASSES[attentionLevel]}`} />
        <span className="text-[10px] font-semibold tracking-widest uppercase text-[--color-text-tertiary]">
          {title}
        </span>
        {totalSessions > 0 && (
          <span className="ml-auto text-[10px] text-[--color-text-tertiary] px-1.5 py-0.5 rounded-full bg-[--color-bg-elevated]">
            {totalSessions}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-xs text-[--color-text-tertiary] text-center py-6">No sessions</p>
        ) : (
          groups.map((group) => (
            <OrchestratorGroup key={group.parentSessionId} group={group} />
          ))
        )}
      </div>
    </div>
  );
}
