"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Built-in agents available in the dashboard (matches static imports in services.ts). */
const BUILT_IN_AGENTS = ["claude-code", "codex", "cursor", "kimicode", "grok", "opencode"] as const;

export interface CreateOrchestratorModalProps {
  projects: Array<{ id: string; name: string; path: string }>;
  existingNames: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function validateName(value: string, existingNames: string[]): string | null {
  if (!value.trim()) return "name is required";
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return "name must match [a-zA-Z0-9_-]+";
  if (existingNames.includes(value)) return `'${value}' already exists`;
  return null;
}

export function CreateOrchestratorModal({
  projects,
  existingNames,
  onClose,
  onSuccess,
}: CreateOrchestratorModalProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<"all" | "specific">("all");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [agent, setAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleNameBlur = () => {
    setNameError(validateName(name, existingNames));
  };

  const toggleProject = (path: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateName(name, existingNames);
    if (err) {
      setNameError(err);
      return;
    }

    const scope: "all" | string[] =
      scopeMode === "all" ? "all" : [...selectedProjects];

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await fetch("/api/orchestrators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, scope, agent: agent || undefined }),
      });
      const body = (await res.json()) as { sessionId?: string; error?: string };
      if (!res.ok) {
        setApiError(body.error ?? "Failed to create orchestrator");
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setApiError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-surface)_64%,transparent)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-text-primary)]">
          New Orchestrator
        </h2>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          {/* Name */}
          <div className="mb-4">
            <label
              htmlFor="orch-name"
              className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Name
            </label>
            <input
              id="orch-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g. main"
              autoFocus
              className={cn(
                "w-full rounded border px-3 py-2 text-sm",
                "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]",
                "placeholder:text-[var(--color-text-muted)]",
                nameError
                  ? "border-[var(--color-status-error)]"
                  : "border-[var(--color-border-default)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
              )}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-[var(--color-status-error)]">{nameError}</p>
            ) : null}
          </div>

          {/* Scope */}
          <div className="mb-4">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
              Scope
            </span>
            <div className="flex gap-3">
              {(["all", "specific"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScopeMode(mode)}
                  className={cn(
                    "rounded border px-3 py-1 text-sm",
                    scopeMode === mode
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-text-primary)]"
                      : "border-[var(--color-border-default)] text-[var(--color-text-secondary)]",
                  )}
                >
                  {mode === "all" ? "All projects" : "Specific projects"}
                </button>
              ))}
            </div>

            {scopeMode === "specific" && projects.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                {projects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedProjects.has(p.path)}
                      onChange={() => toggleProject(p.path)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="text-[var(--color-text-primary)]">{p.name}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {/* Agent */}
          <div className="mb-6">
            <label
              htmlFor="orch-agent"
              className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Agent{" "}
              <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
            </label>
            <select
              id="orch-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className={cn(
                "w-full rounded border px-3 py-2 text-sm",
                "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]",
                "border-[var(--color-border-default)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
              )}
            >
              <option value="">Default</option>
              {BUILT_IN_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {apiError ? (
            <p className="mb-4 text-sm text-[var(--color-status-error)]">{apiError}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-label="Create & Start"
              className={cn(
                "rounded border px-4 py-2 text-sm font-medium",
                "bg-[var(--color-accent)] text-[var(--color-text-inverse)]",
                "border-transparent",
                "disabled:opacity-50",
              )}
            >
              {submitting ? "Creating…" : "Create & Start"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deprecated alias — keep for callers not yet migrated
// ---------------------------------------------------------------------------

/** @deprecated Use CreateOrchestratorModal */
export const CreateMetaOrchestratorModal = CreateOrchestratorModal;
/** @deprecated Use CreateOrchestratorModalProps */
export type CreateMetaOrchestratorModalProps = CreateOrchestratorModalProps;
