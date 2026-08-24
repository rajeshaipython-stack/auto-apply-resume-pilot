import type { z } from "zod";
import type { ResumePilotContext } from "../context.js";

/** Result a tool handler returns; the server renders it into MCP content. */
export interface ToolResult {
  /** Human-readable summary shown to Claude/the user. */
  summary: string;
  /** Optional structured payload (also serialized into the text block). */
  data?: unknown;
  /** Marks a handled, expected error (bad input, missing prerequisite). */
  isError?: boolean;
}

/**
 * A ResumePilot MCP tool in its uniform, registration-ready form. `inputSchema`
 * is a Zod object schema used both for runtime validation and to advertise the
 * JSON schema to MCP clients.
 */
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (ctx: ResumePilotContext, args: any) => Promise<ToolResult>;
}

/**
 * Authoring helper: preserves full type inference for `args` inside the handler
 * (derived from the schema `S`) while returning the uniform {@link ToolDef} so
 * tools can be collected into a single array without variance errors.
 */
export function defineTool<S extends z.ZodTypeAny>(def: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (ctx: ResumePilotContext, args: z.infer<S>) => Promise<ToolResult>;
}): ToolDef {
  return def as unknown as ToolDef;
}
