import { ENV, getEnvString } from "./env.js";

export function isPortfolioEnabled(): boolean {
  const value = getEnvString(ENV.ENABLE_PORTFOLIO);
  if (value === "0" || value === "false") return false;
  return true;
}
