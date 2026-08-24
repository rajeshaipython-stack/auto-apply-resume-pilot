import fs from "node:fs";
import path from "node:path";
import type { ResumePilotDB } from "../database/database.js";
import type {
  StructuredJob,
  ApplicationRecord,
  ApplicationStatus,
  ATSAnalysis,
  MasterProfile,
  EmailUpdate,
  StatusHistoryEntry,
} from "../models/index.js";
import { APPLICATION_STATUS_ORDER, TERMINAL_STATUSES } from "../models/common.js";
import { uuid, applicationSlug } from "../utils/id.js";

export interface TrackerConfig {
  applicationsDir: string;
}

/**
 * Owns the application lifecycle: creation, immutable per-application resume
 * versions, status transitions with timestamped history, and email-derived
 * updates. Persists both to SQLite (queryable) and to the on-disk
 * `applications/application-00X/` layout described in the product spec.
 */
export class ApplicationTracker {
  constructor(private db: ResumePilotDB, private cfg: TrackerConfig) {}

  /** Directory for an application's immutable artifacts. */
  dirFor(app: ApplicationRecord): string {
    return path.join(this.cfg.applicationsDir, app.slug);
  }

  create(
    job: StructuredJob,
    opts: { status?: ApplicationStatus; note?: string } = {},
  ): ApplicationRecord {
    const number = this.db.nextApplicationNumber();
    const slug = applicationSlug(number);
    const now = new Date().toISOString();
    const status = opts.status ?? "DISCOVERED";

    const record: ApplicationRecord = {
      id: uuid(),
      number,
      slug,
      jobId: job.id,
      company: job.company,
      role: job.title,
      jobSourceAdapter: job.source.adapter,
      jobUrl: job.applicationUrl ?? job.source.url,
      status,
      statusHistory: [{ status, at: now, note: opts.note, source: "system" }],
      pendingManualActions: [],
      emailUpdates: [],
      createdAt: now,
      updatedAt: now,
    };

    // Ensure job persisted, then application.
    if (!this.db.getJob(job.id)) this.db.saveJob(job);
    this.db.insertApplication(record);

    const dir = this.dirFor(record);
    fs.mkdirSync(dir, { recursive: true });
    this.writeJson(dir, "job.json", job);
    this.persistFiles(record);
    return record;
  }

  /** Record the ORIGINAL (master-resume) analysis for a job; status -> ANALYZING. */
  setOriginalAnalysis(id: string, original: ATSAnalysis): ApplicationRecord {
    const app = this.require(id);
    app.originalAtsScore = original.atsScore;
    app.matchScore = original.overallMatchScore;
    this.writeJson(this.dirFor(app), "original-ats.json", original);
    this.transition(app, "ANALYZING", "Original resume scored against job.", "system");
    return app;
  }

  attachAnalysis(
    id: string,
    original: ATSAnalysis,
    optimized: ATSAnalysis,
  ): ApplicationRecord {
    const app = this.require(id);
    app.originalAtsScore = original.atsScore;
    app.optimizedAtsScore = optimized.atsScore;
    app.matchScore = optimized.overallMatchScore;
    const dir = this.dirFor(app);
    this.writeJson(dir, "original-ats.json", original);
    this.writeJson(dir, "optimized-ats.json", optimized);
    this.transition(app, "CUSTOMIZED", "Resume analyzed and customized.", "system");
    return app;
  }

  attachResume(
    id: string,
    files: { pdfPath?: string; docxPath?: string; version?: string },
  ): ApplicationRecord {
    const app = this.require(id);
    if (files.pdfPath) app.resumePdfPath = files.pdfPath;
    if (files.docxPath) app.resumeDocxPath = files.docxPath;
    app.resumeVersion = files.version ?? app.slug;
    this.save(app);
    return app;
  }

  attachProfile(id: string, profile: MasterProfile): void {
    const app = this.require(id);
    this.writeJson(this.dirFor(app), "profile.json", profile);
  }

  setStatus(
    id: string,
    status: ApplicationStatus,
    note?: string,
    source = "user",
  ): ApplicationRecord {
    const app = this.require(id);
    this.transition(app, status, note, source);
    if (status === "APPLIED" && !app.appliedAt) {
      app.appliedAt = new Date().toISOString();
      this.save(app);
    }
    return app;
  }

  addPendingManualActions(id: string, actions: string[]): ApplicationRecord {
    const app = this.require(id);
    app.pendingManualActions = [...new Set([...app.pendingManualActions, ...actions])];
    this.save(app);
    return app;
  }

  addEmailUpdate(id: string, update: EmailUpdate): ApplicationRecord {
    const app = this.require(id);
    app.emailUpdates.push(update);
    if (update.extractedStatus && this.isForward(app.status, update.extractedStatus)) {
      this.transition(app, update.extractedStatus, `From email: ${update.subject ?? ""}`.trim(), "email");
    } else {
      this.save(app);
    }
    return app;
  }

  get(id: string): ApplicationRecord | undefined {
    return this.db.getApplication(id);
  }
  getByNumber(n: number): ApplicationRecord | undefined {
    return this.db.getApplicationByNumber(n);
  }
  list(): ApplicationRecord[] {
    return this.db.listApplications();
  }

  /** A rendered timeline for the tracking view. */
  timeline(app: ApplicationRecord): { status: ApplicationStatus; at: string; note?: string; source: string }[] {
    return [...app.statusHistory].sort((a, b) => a.at.localeCompare(b.at));
  }

  // ---- internals ---------------------------------------------------------
  private transition(
    app: ApplicationRecord,
    status: ApplicationStatus,
    note: string | undefined,
    source: string,
  ): void {
    const entry: StatusHistoryEntry = {
      status,
      at: new Date().toISOString(),
      note,
      source,
    };
    app.status = status;
    app.statusHistory.push(entry);
    app.updatedAt = entry.at;
    this.db.insertHistory(app.id, entry);
    this.db.updateApplication(app);
    this.persistFiles(app);
  }

  private save(app: ApplicationRecord): void {
    app.updatedAt = new Date().toISOString();
    this.db.updateApplication(app);
    this.persistFiles(app);
  }

  private require(id: string): ApplicationRecord {
    const app = this.db.getApplication(id);
    if (!app) throw new Error(`Application not found: ${id}`);
    return app;
  }

  /** Should an incoming status move the application forward (not backward)? */
  private isForward(current: ApplicationStatus, incoming: ApplicationStatus): boolean {
    if (TERMINAL_STATUSES.includes(incoming)) return true;
    const ci = APPLICATION_STATUS_ORDER.indexOf(current);
    const ii = APPLICATION_STATUS_ORDER.indexOf(incoming);
    if (ii === -1) return false;
    return ii >= ci;
  }

  private persistFiles(app: ApplicationRecord): void {
    const dir = this.dirFor(app);
    fs.mkdirSync(dir, { recursive: true });
    this.writeJson(dir, "application.json", app);
    this.writeJson(dir, "tracking.json", {
      applicationId: app.id,
      number: app.number,
      company: app.company,
      role: app.role,
      status: app.status,
      timeline: this.timeline(app),
      emailUpdates: app.emailUpdates,
      pendingManualActions: app.pendingManualActions,
    });
  }

  private writeJson(dir: string, name: string, data: unknown): void {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), "utf8");
  }
}
