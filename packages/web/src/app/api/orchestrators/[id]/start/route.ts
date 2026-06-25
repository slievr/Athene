import { type NextRequest } from "next/server";
import { generateOrchestratorPrompt } from "@made-by-moonlight/athene-core";
import { getServices } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/orchestrators/[id]/start — Start the orchestrator with the given UUID. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = getCorrelationId(request);
  const { id } = await params;

  try {
    const { config, sessionManager } = await getServices();

    const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
    const orchEntry = Object.entries(orchMap).find(
      ([, v]) => (v as { id?: string }).id === id,
    );
    if (!orchEntry) {
      return jsonWithCorrelation(
        { error: `Unknown orchestrator "${id}"` },
        { status: 404 },
        correlationId,
      );
    }
    const [name, orch] = orchEntry;

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
