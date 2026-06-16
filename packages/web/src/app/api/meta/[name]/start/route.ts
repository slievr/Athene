import { type NextRequest } from "next/server";
import { generateMetaOrchestratorPrompt } from "@made-by-moonlight/athene-core";
import { getServices } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/meta/[name]/start — Start the named meta orchestrator */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const correlationId = getCorrelationId(request);
  const { name } = await params;

  try {
    const { config, sessionManager } = await getServices();

    const meta = config.metaOrchestrators?.[name];
    if (!meta) {
      return jsonWithCorrelation(
        { error: `Unknown meta orchestrator "${name}"` },
        { status: 404 },
        correlationId,
      );
    }

    const systemPrompt = generateMetaOrchestratorPrompt({ config, name });
    const session = await sessionManager.ensureMetaOrchestrator({
      name,
      systemPrompt,
      agent: meta.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id }, { status: 200 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to start meta orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
