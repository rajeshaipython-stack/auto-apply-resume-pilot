import fs from "node:fs";
import path from "node:path";
import { loadConfig, type ResumePilotConfig } from "./utils/config.js";
import { ResumePilotDB } from "./database/database.js";
import { ResumeParser } from "./services/ResumeParser.js";
import { JobAnalyzer } from "./services/JobAnalyzer.js";
import { ATSAnalyzer } from "./services/ATSAnalyzer.js";
import { ResumeOptimizer } from "./services/ResumeOptimizer.js";
import { JobRanker } from "./services/JobRanker.js";
import { ProfileService } from "./services/ProfileService.js";
import { ApplicationTracker } from "./services/ApplicationTracker.js";
import { ReportGenerator } from "./services/ReportGenerator.js";
import { ResumeDocumentGenerator } from "./services/ResumeDocumentGenerator.js";
import { JobSourceRegistry } from "./providers/jobs/registry.js";
import { ManualJobSourceAdapter } from "./providers/jobs/ManualJobSourceAdapter.js";
import { ApplicationAdapterRegistry } from "./providers/applications/registry.js";
import { MockEmailProvider } from "./providers/email/MockEmailProvider.js";
import type { EmailProvider } from "./providers/email/EmailProvider.js";
import type { ParsedResume, MasterProfile } from "./models/index.js";

/**
 * The composition root. Wires configuration, database, services and provider
 * registries into a single context that all MCP tools share. One instance per
 * server process.
 */
export class ResumePilotContext {
  readonly config: ResumePilotConfig;
  readonly db: ResumePilotDB;
  readonly parser = new ResumeParser();
  readonly jobAnalyzer = new JobAnalyzer();
  readonly ats = new ATSAnalyzer();
  readonly optimizer = new ResumeOptimizer();
  readonly ranker = new JobRanker();
  readonly profiles = new ProfileService();
  readonly tracker: ApplicationTracker;
  readonly reports: ReportGenerator;
  readonly docs = new ResumeDocumentGenerator();
  readonly jobSources = new JobSourceRegistry();
  readonly appAdapters = new ApplicationAdapterRegistry();
  readonly email: EmailProvider = new MockEmailProvider();

  private constructor(config: ResumePilotConfig, db: ResumePilotDB) {
    this.config = config;
    this.db = db;
    this.tracker = new ApplicationTracker(db, { applicationsDir: config.applicationsDir });
    this.reports = new ReportGenerator(this.tracker, {
      reportsDir: config.reportsDir,
      applicationsDir: config.applicationsDir,
    });
  }

  static create(env: NodeJS.ProcessEnv = process.env): ResumePilotContext {
    const config = loadConfig(env);
    for (const dir of [
      config.dataDir,
      config.masterResumeDir,
      config.applicationsDir,
      config.reportsDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const db = new ResumePilotDB(config.dbPath);
    return new ResumePilotContext(config, db);
  }

  // ---- master resume storage --------------------------------------------
  private get parsedResumePath(): string {
    return path.join(this.config.masterResumeDir, "parsed.json");
  }
  private get masterCopyPathBase(): string {
    return path.join(this.config.masterResumeDir, "master");
  }

  /** Store the immutable master resume file + its parsed structure. */
  saveMasterResume(parsed: ParsedResume, originalFilePath?: string): void {
    fs.writeFileSync(this.parsedResumePath, JSON.stringify(parsed, null, 2), "utf8");
    if (originalFilePath && fs.existsSync(originalFilePath)) {
      const ext = path.extname(originalFilePath) || ".txt";
      fs.copyFileSync(originalFilePath, this.masterCopyPathBase + ext);
    }
    this.db.setMeta("master_resume_ingested_at", new Date().toISOString());
  }

  /** Store a master resume provided as raw text (no source file). */
  saveMasterResumeText(rawText: string, parsed: ParsedResume): void {
    fs.writeFileSync(this.masterCopyPathBase + ".txt", rawText, "utf8");
    fs.writeFileSync(this.parsedResumePath, JSON.stringify(parsed, null, 2), "utf8");
    this.db.setMeta("master_resume_ingested_at", new Date().toISOString());
  }

  getMasterResume(): ParsedResume | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.parsedResumePath, "utf8")) as ParsedResume;
    } catch {
      return undefined;
    }
  }

  requireMasterResume(): ParsedResume {
    const r = this.getMasterResume();
    if (!r) {
      throw new Error(
        "No master resume found. Use `upload_master_resume` then `analyze_master_resume` first.",
      );
    }
    return r;
  }

  getProfile(): MasterProfile | undefined {
    return this.db.getProfile();
  }
  requireProfile(): MasterProfile {
    const p = this.getProfile();
    if (!p) {
      throw new Error(
        "No profile found. Run `analyze_master_resume` (and `setup_user_profile`) first.",
      );
    }
    return p;
  }

  manualJobAdapter(): ManualJobSourceAdapter {
    return this.jobSources.get("manual") as ManualJobSourceAdapter;
  }

  close(): void {
    this.db.close();
  }
}
