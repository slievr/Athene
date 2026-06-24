"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ProjectInfo } from "@/lib/project-name";

interface OrchestratorSettingsBarProps {
  /** Orchestrator UUID. */
  orchId: string;
  /** Current display label (falls back to slug if none). */
  currentLabel: string;
  /** Current scope: "all" or array of directory paths. */
  currentScope: "all" | string[];
  /** Current discover setting. */
  currentDiscover: boolean;
  /** All registered projects for the scope picker. */
  projects: ProjectInfo[];
  /** Count of active sessions — shown in delete confirmation. */
  sessionCount: number;
}

export function OrchestratorSettingsBar({
  orchId,
  currentLabel,
  currentScope,
  currentDiscover,
  projects,
  sessionCount,
}: OrchestratorSettingsBarProps) {
  const router = useRouter();

  // --- Display name ---
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(currentLabel);
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const saveName = async () => {
    if (nameValue.trim() === currentLabel) { setEditingName(false); return; }
    setNameSaving(true);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setNameSaving(false);
    setEditingName(false);
    router.refresh();
  };

  // --- Scope picker ---
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const [scopeValue, setScopeValue] = useState<"all" | string[]>(currentScope);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveScope = async (newScope: "all" | string[]) => {
    setScopeValue(newScope);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: newScope }),
    });
    router.refresh();
  };

  const toggleScopePath = async (path: string) => {
    const current = scopeValue === "all" ? [] : (scopeValue as string[]);
    const next = current.includes(path) ? current.filter((p) => p !== path) : [...current, path];
    await saveScope(next.length === 0 ? "all" : next);
  };

  const scopeLabel =
    scopeValue === "all"
      ? "All directories"
      : `${(scopeValue as string[]).length} director${(scopeValue as string[]).length === 1 ? "y" : "ies"}`;

  // --- Discovery toggle ---
  const [discover, setDiscover] = useState(currentDiscover);
  const [discoverSaving, setDiscoverSaving] = useState(false);

  const toggleDiscover = async () => {
    const next = !discover;
    setDiscover(next);
    setDiscoverSaving(true);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discover: next }),
    });
    setDiscoverSaving(false);
    router.refresh();
  };

  // --- Delete ---
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, { method: "DELETE" });
    router.push("/");
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-4 py-2 text-[12px]">
      {/* Display name */}
      {editingName ? (
        <input
          ref={nameInputRef}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveName();
            if (e.key === "Escape") { setNameValue(currentLabel); setEditingName(false); }
          }}
          disabled={nameSaving}
          className="rounded border border-[var(--color-accent)] bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[12px] text-[var(--color-text-primary)] focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="flex items-center gap-1 font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
          title="Click to rename"
        >
          {nameValue}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 opacity-50" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        </button>
      )}

      <span className="text-[var(--color-text-muted)]">·</span>

      {/* Scope picker */}
      <div ref={scopeRef} className="relative">
        <button
          type="button"
          onClick={() => setScopeOpen((v) => !v)}
          className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          {scopeLabel}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {scopeOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-2 shadow-lg">
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--color-bg-hover)]">
              <input
                type="radio"
                checked={scopeValue === "all"}
                onChange={() => void saveScope("all")}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-[12px] text-[var(--color-text-primary)]">All directories</span>
            </label>
            {projects.filter((p) => !p.resolveError && p.path).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--color-bg-hover)]">
                <input
                  type="checkbox"
                  checked={scopeValue !== "all" && (scopeValue as string[]).includes(p.path)}
                  onChange={() => void toggleScopePath(p.path)}
                  className="accent-[var(--color-accent)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-[var(--color-text-primary)]">{p.name}</div>
                  <div className="truncate text-[10px] text-[var(--color-text-muted)]">{p.path}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <span className="text-[var(--color-text-muted)]">·</span>

      {/* Discovery toggle */}
      <button
        type="button"
        onClick={() => void toggleDiscover()}
        disabled={discoverSaving}
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-0.5",
          discover
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)]",
          "hover:text-[var(--color-text-primary)] disabled:opacity-50",
        )}
        title={discover ? "Discovery on — click to disable" : "Discovery off — click to enable"}
      >
        <span className={cn("h-2 w-2 rounded-full", discover ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-muted)]")} aria-hidden="true" />
        Discovery
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Delete */}
      {deleteConfirm ? (
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-secondary)]">
            Kill {sessionCount} session{sessionCount !== 1 ? "s" : ""} and remove?
          </span>
          <button
            type="button"
            onClick={() => setDeleteConfirm(false)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded px-2 py-0.5 text-[var(--color-status-error)] hover:bg-[color-mix(in_srgb,var(--color-status-error)_15%,transparent)] disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Delete"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDeleteConfirm(true)}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-status-error)]"
          aria-label="Delete orchestrator"
          title="Delete orchestrator"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      )}
    </div>
  );
}
