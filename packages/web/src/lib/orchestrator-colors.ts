const PALETTE_SIZE = 10;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  }
  return h % PALETTE_SIZE;
}

/** Returns a stable 0–9 index for a given orchestrator session ID. */
export function getOrchestratorColorIndex(parentSessionId: string): number {
  return hashId(parentSessionId);
}

/** Returns the Tailwind-compatible CSS class for the orchestrator dot. */
export function getOrchestratorDotClass(parentSessionId: string): string {
  return `orch-dot-${hashId(parentSessionId)}`;
}

/** Returns the CSS class for a card's left border accent. */
export function getOrchestratorBorderClass(parentSessionId: string): string {
  return `orch-border-${hashId(parentSessionId)}`;
}
