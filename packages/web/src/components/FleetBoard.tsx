"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { FleetColumn } from "./FleetColumn";
import { FleetFilterBar, type OrchestratorChipData } from "./FleetFilterBar";
import { type OrchestratorGroupData } from "./OrchestratorGroup";
import { getAttentionLevel, type DashboardSession, type AttentionLevel } from "@/lib/types";

const COLUMNS: { level: AttentionLevel; title: string }[] = [
  { level: "working", title: "Working" },
  { level: "action", title: "Action" },
  { level: "pending", title: "Pending" },
  { level: "merge", title: "Merge" },
  { level: "done", title: "Done" },
];

function buildGroups(
  sessions: DashboardSession[],
  filterName: string | null,
): Map<AttentionLevel, OrchestratorGroupData[]> {
  const workerSessions = sessions.filter((s) => s.metadata?.["role"] !== "orchestrator");

  const groupMap = new Map<string, OrchestratorGroupData>();
  for (const session of workerSessions) {
    const key =
      (session.metadata?.["parentSessionId"] as string | undefined) ??
      (session.metadata?.["orchestratorOwner"] as string | undefined) ??
      "default";
    const name =
      (session.metadata?.["orchestratorOwner"] as string | undefined) ?? "default";

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        parentSessionId: key,
        orchestratorName: name,
        spawnedAt: session.createdAt,
        sessions: [],
      });
    }
    groupMap.get(key)!.sessions.push(session);
  }

  let groups = Array.from(groupMap.values());
  if (filterName) {
    groups = groups.filter((g) => g.orchestratorName === filterName);
  }

  const byLevel = new Map<AttentionLevel, OrchestratorGroupData[]>();
  for (const col of COLUMNS) byLevel.set(col.level, []);

  for (const group of groups) {
    const levelGroups = new Map<AttentionLevel, DashboardSession[]>();
    for (const session of group.sessions) {
      const level = getAttentionLevel(session, "simple");
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(session);
    }
    for (const [level, lvlSessions] of levelGroups) {
      if (!byLevel.has(level)) continue;
      byLevel.get(level)!.push({ ...group, sessions: lvlSessions });
    }
  }

  return byLevel;
}

interface FleetBoardProps {
  initialSessions: DashboardSession[];
}

/** Assign a stable color index to each group by hashing `parentSessionId`. */
function colorIndexForKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 10;
}

export function FleetBoard({ initialSessions }: FleetBoardProps) {
  const { sessions } = useSessionEvents({
    initialSessions,
    attentionZones: "simple",
  });
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeFilter = searchParams.get("orch");

  const handleFilterChange = (name: string | null) => {
    if (name) {
      router.push(`/fleet?orch=${encodeURIComponent(name)}`);
    } else {
      router.push("/fleet");
    }
  };

  const allGroups = buildGroups(sessions, null);
  const groupsByLevel = buildGroups(sessions, activeFilter);

  const allWorkers = sessions.filter((s) => s.metadata?.["role"] !== "orchestrator");
  const filteredWorkers = activeFilter
    ? allWorkers.filter((s) => s.metadata?.["orchestratorOwner"] === activeFilter)
    : allWorkers;

  // Build chip data: one entry per unique orchestrator name, with color from first
  // group with that name and earliest spawnedAt across all groups with that name.
  const chipMap = new Map<string, OrchestratorChipData>();
  for (const groups of allGroups.values()) {
    for (const group of groups) {
      const existing = chipMap.get(group.orchestratorName);
      if (!existing) {
        chipMap.set(group.orchestratorName, {
          name: group.orchestratorName,
          colorIndex: colorIndexForKey(group.parentSessionId),
          spawnedAt: group.spawnedAt,
        });
      } else {
        // Use earliest spawnedAt
        if (
          group.spawnedAt &&
          (!existing.spawnedAt || group.spawnedAt < existing.spawnedAt)
        ) {
          chipMap.set(group.orchestratorName, { ...existing, spawnedAt: group.spawnedAt });
        }
      }
    }
  }
  const orchestratorChips = Array.from(chipMap.values());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FleetFilterBar
        orchestrators={orchestratorChips}
        activeFilter={activeFilter}
        totalWorkers={filteredWorkers.length}
        onFilterChange={handleFilterChange}
      />
      <div className="flex flex-1 overflow-x-auto overflow-y-hidden px-5 py-4">
        {COLUMNS.map(({ level, title }) => (
          <FleetColumn
            key={level}
            title={title}
            groups={groupsByLevel.get(level) ?? []}
            attentionLevel={level}
          />
        ))}
      </div>
    </div>
  );
}
