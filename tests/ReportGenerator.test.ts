import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ResumePilotDB } from "../src/database/database.js";
import { ApplicationTracker } from "../src/services/ApplicationTracker.js";
import { ReportGenerator } from "../src/services/ReportGenerator.js";
import { JobAnalyzer } from "../src/services/JobAnalyzer.js";
import { SAMPLE_JD } from "./fixtures.js";

let dir: string;
let db: ResumePilotDB;
let tracker: ApplicationTracker;
let reports: ReportGenerator;
const job = new JobAnalyzer().analyze({ description: SAMPLE_JD, source: { adapter: "manual" } });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-report-"));
  db = new ResumePilotDB(":memory:");
  const applicationsDir = path.join(dir, "applications");
  tracker = new ApplicationTracker(db, { applicationsDir });
  reports = new ReportGenerator(tracker, { reportsDir: path.join(dir, "reports"), applicationsDir });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ReportGenerator", () => {
  it("computes summary statistics", () => {
    const app = tracker.create(job);
    tracker.setStatus(app.id, "APPLIED");
    const s = reports.summary(tracker.list());
    expect(s.totalDiscovered).toBe(1);
    expect(s.totalApplications).toBe(1);
  });

  it("generates a non-empty PDF report", async () => {
    tracker.create(job);
    const pdf = await reports.generatePdfReport();
    expect(fs.existsSync(pdf)).toBe(true);
    expect(fs.statSync(pdf).size).toBeGreaterThan(500);
    const head = fs.readFileSync(pdf).subarray(0, 5).toString("latin1");
    expect(head).toBe("%PDF-");
  });

  it("generates HTML tracking pages with an index", async () => {
    const app = tracker.create(job);
    const { indexPath, pages } = await reports.generateTrackingPages();
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(pages.length).toBe(1);
    const html = fs.readFileSync(path.join(path.dirname(indexPath), `${app.slug}.html`), "utf8");
    expect(html).toContain("Timeline");
    expect(html).toContain(app.company ?? "");
  });
});
