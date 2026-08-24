#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResumePilotContext } from "./context.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { logger } from "./utils/logger.js";

/**
 * ResumePilot MCP — stdio entrypoint for Claude Desktop.
 *
 * IMPORTANT: all logging goes to stderr (see utils/logger). stdout is reserved
 * for the JSON-RPC transport.
 */
async function main(): Promise<void> {
  const ctx = ResumePilotContext.create();
  logger.setLevel(ctx.config.logLevel);
  logger.info(`${SERVER_NAME} v${SERVER_VERSION} starting`, {
    dataDir: ctx.config.dataDir,
    tools: "registered",
  });

  const server = buildServer(ctx);
  const transport = new StdioServerTransport();

  const shutdown = () => {
    logger.info("Shutting down");
    try {
      ctx.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
  logger.info("ResumePilot MCP connected over stdio and ready.");
}

main().catch((err) => {
  logger.error("Fatal startup error", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
