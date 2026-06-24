"use client";

import { formatRelativeTime } from "@/lib/format";

export interface OrchestratorChipData {
  name: string;
  colorIndex: number;
  spawnedAt: string | null;
}

interface Props {
  orchestrators: OrchestratorChipData[];
  activeFilter: string | null;
  totalWorkers: number;
  onFilterChange: (name: string | null) => void;
}

export function FleetFilterBar({
  orchestrators,
  activeFilter,
  totalWorkers,
  onFilterChange,
}: Props) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border-default)] shrink-0">
      <h1 className="text-sm font-semibold text-[var(--color-text-primary)] mr-2">Fleet</h1>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onFilterChange(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            activeFilter === null
              ? "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-primary)]"
              : "border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          }`}
        >
          All
        </button>
        {orchestrators.map((orch) => (
          <button
            key={orch.name}
            onClick={() => onFilterChange(orch.name)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeFilter === orch.name
                ? "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-primary)]"
                : "border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <div className={`orch-dot-${orch.colorIndex} shrink-0 w-2 h-2 rounded-full`} />
            <span>{orch.name}</span>
            {orch.spawnedAt ? (
              <>
                <span className="text-[var(--color-text-tertiary)]">·</span>
                <span className="text-[var(--color-text-tertiary)]">
                  {formatRelativeTime(new Date(orch.spawnedAt).getTime())}
                </span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
        {totalWorkers} {totalWorkers === 1 ? "worker" : "workers"}
      </span>
    </div>
  );
}
