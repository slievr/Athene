import { ENV, getEnvString } from "@made-by-moonlight/athene-core";

export type CallerType = "human" | "orchestrator" | "agent";

/**
 * Detect who is calling the CLI.
 * - If ATHENE_CALLER_TYPE is set, trust it.
 * - Otherwise, if stdout is a TTY, it's a human.
 * - Non-TTY defaults to "agent".
 */
export function getCallerType(): CallerType {
  const env = getEnvString(ENV.CALLER_TYPE);
  if (env === "orchestrator" || env === "agent" || env === "human") {
    return env;
  }
  // A meta orchestrator is an autonomous (non-human) coordinator — coalesce to
  // "orchestrator" so it gets the same non-interactive parity as a per-project
  // orchestrator (otherwise the tmux TTY heuristic below misclassifies it as
  // "human" and it can hang on interactive prompts).
  if (env === "meta-orchestrator") {
    return "orchestrator";
  }
  return process.stdout.isTTY ? "human" : "agent";
}

/**
 * Returns true if the caller is a human (interactive terminal).
 */
export function isHumanCaller(): boolean {
  return getCallerType() === "human";
}
