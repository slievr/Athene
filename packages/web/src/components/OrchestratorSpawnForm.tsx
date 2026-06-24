"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectInfo } from "@/lib/project-name";
import { orchestratorSessionPath } from "@/lib/routes";
import type { DashboardSession } from "@/lib/types";

interface OrchestratorSpawnFormProps {
  orchestratorName: string;
  projects: ProjectInfo[];
}

export function OrchestratorSpawnForm({ orchestratorName, projects }: OrchestratorSpawnFormProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt: prompt.trim() || undefined,
          orchestratorOwner: orchestratorName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { session?: DashboardSession; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to spawn session");
        return;
      }
      if (data.session) {
        router.push(orchestratorSessionPath(orchestratorName, data.session.id));
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-4 py-2"
    >
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        disabled={submitting}
        className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-2 py-1 text-[12px] text-[var(--color-text-primary)] focus:outline-none"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt (optional)"
        disabled={submitting}
        className="flex-1 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-2 py-1 text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={submitting || !projectId}
        className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-3 py-1 text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Spawning…" : "Spawn Session"}
      </button>
      {error && (
        <span className="text-[11px] text-[var(--color-status-error)]">{error}</span>
      )}
    </form>
  );
}
