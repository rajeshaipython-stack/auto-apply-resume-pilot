import fs from "node:fs";
import path from "node:path";
import type {
  MasterProfile,
  StructuredJob,
  ApplicationRecord,
  StatusHistoryEntry,
} from "../models/index.js";

/**
 * Local persistence for ResumePilot.
 *
 * This is a dependency-free, pure-JavaScript JSON-backed store with the same
 * repository API the rest of the app expects. It was deliberately chosen over a
 * native module (e.g. better-sqlite3) so the packaged Claude Desktop extension
 * (.mcpb) is fully portable and loads under any Node/Electron runtime on
 * Windows, macOS and Linux without a platform-specific binary.
 *
 * Data volume for a single user (profile, jobs, applications, history) is small,
 * so an in-memory model persisted atomically to one JSON file is more than
 * sufficient. Status history is kept in a separate map — mirroring a relational
 * `status_history` table — so application updates never duplicate history.
 *
 * Pass ":memory:" for an ephemeral store (used by tests).
 */

interface StoreShape {
  meta: Record<string, string>;
  profile: MasterProfile | null;
  jobs: Record<string, StructuredJob>;
  /** Application records WITHOUT authoritative history (see `history`). */
  applications: Record<string, ApplicationRecord>;
  /** Authoritative, ordered status history per application id. */
  history: Record<string, StatusHistoryEntry[]>;
}

function emptyStore(): StoreShape {
  return { meta: {}, profile: null, jobs: {}, applications: {}, history: {} };
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

export class ResumePilotDB {
  private store: StoreShape = emptyStore();
  private readonly persistent: boolean;
  private readonly filePath: string | undefined;

  constructor(dbPath: string) {
    this.persistent = dbPath !== ":memory:";
    if (this.persistent) {
      // Accept a ".sqlite" path for backwards compatibility; store JSON beside it.
      this.filePath = dbPath.replace(/\.sqlite$/i, "") + ".json";
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.load();
    } else {
      this.filePath = undefined;
    }
  }

  close(): void {
    if (this.persistent) this.flush();
  }

  private load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.store = { ...emptyStore(), ...parsed };
      this.store.meta ??= {};
      this.store.jobs ??= {};
      this.store.applications ??= {};
      this.store.history ??= {};
    } catch {
      this.store = emptyStore();
    }
  }

  /** Atomic write: write to a temp file then rename. */
  private flush(): void {
    if (!this.persistent || !this.filePath) return;
    const tmp = this.filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  // ----- meta / counters -------------------------------------------------
  getMeta(key: string): string | undefined {
    return this.store.meta[key];
  }

  setMeta(key: string, value: string): void {
    this.store.meta[key] = value;
    this.flush();
  }

  nextApplicationNumber(): number {
    const current = Number(this.store.meta["next_application_number"] ?? "1");
    this.store.meta["next_application_number"] = String(current + 1);
    this.flush();
    return current;
  }

  // ----- profile ---------------------------------------------------------
  saveProfile(profile: MasterProfile): void {
    this.store.profile = clone(profile);
    this.flush();
  }

  getProfile(): MasterProfile | undefined {
    return this.store.profile ? clone(this.store.profile) : undefined;
  }

  // ----- jobs ------------------------------------------------------------
  saveJob(job: StructuredJob): void {
    this.store.jobs[job.id] = clone(job);
    this.flush();
  }

  getJob(id: string): StructuredJob | undefined {
    return this.store.jobs[id] ? clone(this.store.jobs[id]) : undefined;
  }

  findJobByFingerprint(fp: string): StructuredJob | undefined {
    const found = Object.values(this.store.jobs).find((j) => j.fingerprint === fp);
    return found ? clone(found) : undefined;
  }

  listJobs(): StructuredJob[] {
    return Object.values(this.store.jobs)
      .slice()
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .map((j) => clone(j));
  }

  // ----- applications ----------------------------------------------------
  insertApplication(app: ApplicationRecord): void {
    // History is authoritative in `history`; seed it from the record, then store
    // the record with an empty history so reads never double-count.
    this.store.history[app.id] = clone(app.statusHistory ?? []);
    this.store.applications[app.id] = { ...clone(app), statusHistory: [] };
    this.flush();
  }

  updateApplication(app: ApplicationRecord): void {
    if (!this.store.applications[app.id]) {
      this.insertApplication(app);
      return;
    }
    // Preserve authoritative history; ignore the record's own statusHistory.
    this.store.applications[app.id] = { ...clone(app), statusHistory: [] };
    this.flush();
  }

  insertHistory(applicationId: string, h: StatusHistoryEntry): void {
    (this.store.history[applicationId] ??= []).push(clone(h));
    this.flush();
  }

  getApplication(id: string): ApplicationRecord | undefined {
    const row = this.store.applications[id];
    if (!row) return undefined;
    return { ...clone(row), statusHistory: clone(this.store.history[id] ?? []) };
  }

  getApplicationByNumber(n: number): ApplicationRecord | undefined {
    const row = Object.values(this.store.applications).find((a) => a.number === n);
    return row ? this.getApplication(row.id) : undefined;
  }

  listApplications(): ApplicationRecord[] {
    return Object.values(this.store.applications)
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((a) => this.getApplication(a.id)!);
  }
}
