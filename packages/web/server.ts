/**
 * Custom Next.js HTTP server.
 * Merges the Next.js app and the mux WebSocket terminal server onto a single
 * port so `pnpm dev` spawns one process instead of two.
 *
 * Usage: tsx server.ts
 */

import { createServer } from "node:http";
import next from "next";
import { attachDirectTerminalWS } from "./server/direct-terminal-ws.js";

// Signal to the runtime/terminal API route that the mux endpoint is on the
// same port as Next.js. MuxProvider reads this and uses same-origin routing
// instead of the direct port fallback (14801).
if (!process.env.TERMINAL_WS_PATH) {
  process.env.TERMINAL_WS_PATH = "/ao-terminal-mux";
}

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  attachDirectTerminalWS(server);

  const port = parseInt(process.env.PORT ?? "3000", 10);
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
