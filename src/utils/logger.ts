/**
 * A minimal logger that writes to **stderr only**.
 *
 * This is critical for MCP stdio servers: stdout carries the JSON-RPC protocol,
 * so anything written to stdout would corrupt the transport. All diagnostics go
 * to stderr, which Claude Desktop surfaces in its MCP logs.
 *
 * The logger also redacts obvious secret-looking values so tokens/passwords are
 * never emitted to logs.
 */

type Level = "error" | "warn" | "info" | "debug";
const LEVEL_WEIGHT: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const SECRET_KEY_RE =
  /(pass(word)?|secret|token|otp|cookie|authorization|api[-_]?key|bearer)/i;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    // Redact anything that looks like a bearer/JWT/long opaque token.
    if (/^(bearer\s+)?[A-Za-z0-9._-]{24,}$/.test(value.trim())) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

export class Logger {
  constructor(private level: Level = "info") {}

  setLevel(level: Level): void {
    this.level = level;
  }

  private write(level: Level, msg: string, meta?: unknown): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) return;
    const ts = new Date().toISOString();
    const line =
      meta === undefined
        ? `[${ts}] ${level.toUpperCase()} ${msg}`
        : `[${ts}] ${level.toUpperCase()} ${msg} ${JSON.stringify(redact(meta))}`;
    process.stderr.write(line + "\n");
  }

  error(msg: string, meta?: unknown): void {
    this.write("error", msg, meta);
  }
  warn(msg: string, meta?: unknown): void {
    this.write("warn", msg, meta);
  }
  info(msg: string, meta?: unknown): void {
    this.write("info", msg, meta);
  }
  debug(msg: string, meta?: unknown): void {
    this.write("debug", msg, meta);
  }
}

export const logger = new Logger(
  (process.env.RESUMEPILOT_LOG_LEVEL as Level) || "info",
);
