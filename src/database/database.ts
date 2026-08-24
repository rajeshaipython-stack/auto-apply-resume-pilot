import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema.js";
import type {
  MasterProfile,
  StructuredJob,
  ApplicationRecord,
  StatusHistoryEntry,
  ApplicationStatus,
} from "../models/index.js";

/**
 * Thin repository over better-sqlite3. Synchronous by design (fine for an MCP
 * stdio server) and easy to unit test with an in-memory database (":memory:").
 */
export class ResumePilotDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // ----- meta / counters -------------------------------------------------
  getMeta(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  /** Atomically allocate the next sequential application number. */
  nextApplicationNumber(): number {
    const tx = this.db.transaction(() => {
      const current = Number(this.getMeta("next_application_number") ?? "1");
      this.setMeta("next_application_number", String(current + 1));
      return current;
    });
    return tx();
  }

  // ----- profile ---------------------------------------------------------
  saveProfile(profile: MasterProfile): void {
    this.db
      .prepare(
        "INSERT INTO profile(id, json, updated_at) VALUES ('master', ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
      )
      .run(JSON.stringify(profile), new Date().toISOString());
  }

  getProfile(): MasterProfile | undefined {
    const row = this.db
      .prepare("SELECT json FROM profile WHERE id = 'master'")
      .get() as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as MasterProfile) : undefined;
  }

  // ----- jobs ------------------------------------------------------------
  saveJob(job: StructuredJob): void {
    this.db
      .prepare(
        `INSERT INTO jobs(id, fingerprint, title, company, location, source, url, json, created_at)
         VALUES (@id, @fingerprint, @title, @company, @location, @source, @url, @json, @created_at)
         ON CONFLICT(id) DO UPDATE SET
           fingerprint=excluded.fingerprint, title=excluded.title, company=excluded.company,
           location=excluded.location, source=excluded.source, url=excluded.url, json=excluded.json`,
      )
      .run({
        id: job.id,
        fingerprint: job.fingerprint,
        title: job.title ?? null,
        company: job.company ?? null,
        location: job.location ?? null,
        source: job.source.adapter,
        url: job.source.url ?? job.applicationUrl ?? null,
        json: JSON.stringify(job),
        created_at: job.createdAt ?? new Date().toISOString(),
      });
  }

  getJob(id: string): StructuredJob | undefined {
    const row = this.db
      .prepare("SELECT json FROM jobs WHERE id = ?")
      .get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as StructuredJob) : undefined;
  }

  findJobByFingerprint(fp: string): StructuredJob | undefined {
    const row = this.db
      .prepare("SELECT json FROM jobs WHERE fingerprint = ? LIMIT 1")
      .get(fp) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as StructuredJob) : undefined;
  }

  listJobs(): StructuredJob[] {
    const rows = this.db
      .prepare("SELECT json FROM jobs ORDER BY created_at DESC")
      .all() as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as StructuredJob);
  }

  // ----- applications ----------------------------------------------------
  insertApplication(app: ApplicationRecord): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO applications(
             id, number, slug, job_id, company, role, source_adapter, job_url,
             status, original_ats, optimized_ats, match_score, resume_version,
             resume_pdf_path, resume_docx_path, applied_at, pending_actions,
             email_updates, created_at, updated_at)
           VALUES (@id, @number, @slug, @job_id, @company, @role, @source_adapter,
             @job_url, @status, @original_ats, @optimized_ats, @match_score,
             @resume_version, @resume_pdf_path, @resume_docx_path, @applied_at,
             @pending_actions, @email_updates, @created_at, @updated_at)`,
        )
        .run(this.toRow(app));
      for (const h of app.statusHistory) this.insertHistory(app.id, h);
    });
    tx();
  }

  updateApplication(app: ApplicationRecord): void {
    this.db
      .prepare(
        `UPDATE applications SET
           company=@company, role=@role, source_adapter=@source_adapter, job_url=@job_url,
           status=@status, original_ats=@original_ats, optimized_ats=@optimized_ats,
           match_score=@match_score, resume_version=@resume_version,
           resume_pdf_path=@resume_pdf_path, resume_docx_path=@resume_docx_path,
           applied_at=@applied_at, pending_actions=@pending_actions,
           email_updates=@email_updates, updated_at=@updated_at
         WHERE id=@id`,
      )
      .run(this.toRow(app));
  }

  insertHistory(applicationId: string, h: StatusHistoryEntry): void {
    this.db
      .prepare(
        "INSERT INTO status_history(application_id, status, at, note, source) VALUES (?, ?, ?, ?, ?)",
      )
      .run(applicationId, h.status, h.at, h.note ?? null, h.source);
  }

  getApplication(id: string): ApplicationRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM applications WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.fromRow(row);
  }

  getApplicationByNumber(n: number): ApplicationRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM applications WHERE number = ?")
      .get(n) as Record<string, unknown> | undefined;
    return row ? this.fromRow(row) : undefined;
  }

  listApplications(): ApplicationRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM applications ORDER BY number ASC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.fromRow(r));
  }

  private getHistory(applicationId: string): StatusHistoryEntry[] {
    const rows = this.db
      .prepare(
        "SELECT status, at, note, source FROM status_history WHERE application_id = ? ORDER BY at ASC, id ASC",
      )
      .all(applicationId) as {
      status: string;
      at: string;
      note: string | null;
      source: string;
    }[];
    return rows.map((r) => ({
      status: r.status as ApplicationStatus,
      at: r.at,
      note: r.note ?? undefined,
      source: r.source,
    }));
  }

  // ----- row mapping -----------------------------------------------------
  private toRow(app: ApplicationRecord): Record<string, unknown> {
    return {
      id: app.id,
      number: app.number,
      slug: app.slug,
      job_id: app.jobId,
      company: app.company ?? null,
      role: app.role ?? null,
      source_adapter: app.jobSourceAdapter,
      job_url: app.jobUrl ?? null,
      status: app.status,
      original_ats: app.originalAtsScore ?? null,
      optimized_ats: app.optimizedAtsScore ?? null,
      match_score: app.matchScore ?? null,
      resume_version: app.resumeVersion ?? null,
      resume_pdf_path: app.resumePdfPath ?? null,
      resume_docx_path: app.resumeDocxPath ?? null,
      applied_at: app.appliedAt ?? null,
      pending_actions: JSON.stringify(app.pendingManualActions ?? []),
      email_updates: JSON.stringify(app.emailUpdates ?? []),
      created_at: app.createdAt,
      updated_at: app.updatedAt,
    };
  }

  private fromRow(row: Record<string, unknown>): ApplicationRecord {
    const id = row.id as string;
    return {
      id,
      number: row.number as number,
      slug: row.slug as string,
      jobId: row.job_id as string,
      company: (row.company as string) ?? undefined,
      role: (row.role as string) ?? undefined,
      jobSourceAdapter: row.source_adapter as string,
      jobUrl: (row.job_url as string) ?? undefined,
      status: row.status as ApplicationStatus,
      statusHistory: this.getHistory(id),
      originalAtsScore: (row.original_ats as number) ?? undefined,
      optimizedAtsScore: (row.optimized_ats as number) ?? undefined,
      matchScore: (row.match_score as number) ?? undefined,
      resumeVersion: (row.resume_version as string) ?? undefined,
      resumePdfPath: (row.resume_pdf_path as string) ?? undefined,
      resumeDocxPath: (row.resume_docx_path as string) ?? undefined,
      appliedAt: (row.applied_at as string) ?? undefined,
      emailUpdates: JSON.parse((row.email_updates as string) ?? "[]"),
      pendingManualActions: JSON.parse((row.pending_actions as string) ?? "[]"),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
