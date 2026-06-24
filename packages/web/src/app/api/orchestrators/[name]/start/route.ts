import { type NextRequest } from "next/server";
import { generateOrchestratorPrompt } from "@made-by-moonlight/athene-core";
import { getServices } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/orchestrators/[name]/start — Start the named orchestrator. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const correlationId = getCorrelationId(request);
  const { name } = await params;

  try {
    const { config, sessionManager } = await getServices();

    const orchMap = config.orchestrators ?? config.metaOrchestrators;
    const orch = orchMap?.[name];
    if (!orch) {
      return jsonWithCorrelation(
        { error: `Unknown orchestrator "${name}"` },
        { status: 404 },
        correlationId,
      );
    }

    const systemPrompt = generateOrchestratorPrompt({ config, name });
    const session = await sessionManager.ensureOrchestrator({
      name,
      systemPrompt,
      agent: orch.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id }, { status: 200 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to start orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
