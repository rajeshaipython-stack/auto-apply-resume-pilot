import path from "node:path";
import os from "node:os";

/**
 * Central runtime configuration, resolved from environment variables with safe
 * defaults. No secrets are ever logged. See `.env.example` for documentation.
 */
export interface ResumePilotConfig {
  dataDir: string;
  dbFile: string;
  dbPath: string;
  masterResumeDir: string;
  applicationsDir: string;
  reportsDir: string;
  atsTargetScore: number;
  matchScoreThreshold: number;
  jobSearchMaxJobs: number;
  jobSearchConcurrency: number;
  logLevel: "error" | "warn" | "info" | "debug";
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ResumePilotConfig {
  const dataDir = path.resolve(
    env.RESUMEPILOT_DATA_DIR && env.RESUMEPILOT_DATA_DIR.trim() !== ""
      ? env.RESUMEPILOT_DATA_DIR
      : path.join(process.cwd(), "data"),
  );
  const dbFile = env.RESUMEPILOT_DB_FILE?.trim() || "resumepilot.sqlite";

  const level = (env.RESUMEPILOT_LOG_LEVEL || "info").toLowerCase();
  const logLevel = (["error", "warn", "info", "debug"].includes(level)
    ? level
    : "info") as ResumePilotConfig["logLevel"];

  return {
    dataDir,
    dbFile,
    dbPath: path.join(dataDir, dbFile),
    masterResumeDir: path.join(dataDir, "master-resume"),
    applicationsDir: path.join(dataDir, "applications"),
    reportsDir: path.join(dataDir, "reports"),
    atsTargetScore: intEnv("ATS_TARGET_SCORE", 90),
    matchScoreThreshold: intEnv("MATCH_SCORE_THRESHOLD", 60),
    jobSearchMaxJobs: intEnv("JOB_SEARCH_MAX_JOBS", 1000),
    jobSearchConcurrency: intEnv("JOB_SEARCH_CONCURRENCY", 10),
    logLevel,
  };
}

/** Home-relative default, only used by tooling when no cwd data dir is desired. */
export function defaultHomeDataDir(): string {
  return path.join(os.homedir(), ".resumepilot");
}
