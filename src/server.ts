import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { ResumePilotContext } from "./context.js";
import { allTools } from "./tools/index.js";
import type { ToolResult } from "./tools/types.js";
import { logger } from "./utils/logger.js";

export const SERVER_NAME = "resumepilot-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Build the MCP server, wiring every ResumePilot tool to the shared context.
 * Handlers are wrapped so validation/runtime errors become clean MCP tool
 * errors rather than crashing the transport.
 */
export function buildServer(ctx: ResumePilotContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "ResumePilot MCP: a universal job-application assistant. Typical flow: upload_master_resume → analyze_master_resume → setup_user_profile → analyze_job (paste a JD) → optimize_resume_for_job → generate_application_profile → prepare_application → apply_to_job → update_application_tracking → generate_application_report. It never invents resume information and never bypasses CAPTCHA/OTP/2FA or authentication.",
    },
  );

  for (const tool of allTools) {
    const shape = (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape ?? {};
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: shape,
      },
      async (args: unknown) => {
        try {
          const parsed = tool.inputSchema.parse(args ?? {});
          const result: ToolResult = await tool.handler(ctx, parsed);
          return {
            content: [{ type: "text" as const, text: renderResult(result) }],
            isError: result.isError ?? false,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Tool ${tool.name} failed`, { message });
          return {
            content: [{ type: "text" as const, text: `Error in ${tool.name}: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

function renderResult(result: ToolResult): string {
  if (result.data === undefined) return result.summary;
  return `${result.summary}\n\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
}
