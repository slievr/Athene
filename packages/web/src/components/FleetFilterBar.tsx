"use client";

interface Props {
  orchestratorNames: string[];
  activeFilter: string | null;
  totalWorkers: number;
  onFilterChange: (name: string | null) => void;
}

export function FleetFilterBar({
  orchestratorNames,
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
        {orchestratorNames.map((name) => (
          <button
            key={name}
            onClick={() => onFilterChange(name)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeFilter === name
                ? "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-primary)]"
                : "border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
        {totalWorkers} {totalWorkers === 1 ? "worker" : "workers"}
      </span>
    </div>
  );
}
