import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ResumePilotDB } from "../src/database/database.js";
import { ApplicationTracker } from "../src/services/ApplicationTracker.js";
import { JobAnalyzer } from "../src/services/JobAnalyzer.js";
import { classifyEmailStatus } from "../src/providers/email/EmailProvider.js";
import { SAMPLE_JD } from "./fixtures.js";

let dir: string;
let db: ResumePilotDB;
let tracker: ApplicationTracker;
const job = new JobAnalyzer().analyze({ description: SAMPLE_JD, source: { adapter: "manual" } });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-track-"));
  db = new ResumePilotDB(":memory:");
  tracker = new ApplicationTracker(db, { applicationsDir: path.join(dir, "applications") });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ApplicationTracker", () => {
  it("creates an application with slug, dir and initial history", () => {
    const app = tracker.create(job);
    expect(app.number).toBe(1);
    expect(app.slug).toBe("application-001");
    expect(app.status).toBe("DISCOVERED");
    expect(app.statusHistory.length).toBe(1);
    expect(fs.existsSync(path.join(dir, "applications", "application-001", "job.json"))).toBe(true);
  });

  it("records status transitions with timestamped history", () => {
    const app = tracker.create(job);
    tracker.setStatus(app.id, "READY_TO_APPLY", "ready");
    const applied = tracker.setStatus(app.id, "APPLIED");
    expect(applied.status).toBe("APPLIED");
    expect(applied.appliedAt).toBeDefined();
    const history = tracker.timeline(applied).map((h) => h.status);
    expect(history).toEqual(["DISCOVERED", "READY_TO_APPLY", "APPLIED"]);
  });

  it("advances status forward from an email signal but not backward", () => {
    const app = tracker.create(job);
    tracker.setStatus(app.id, "APPLIED");
    tracker.addEmailUpdate(app.id, {
      sender: "r@globex.com",
      subject: "Interview invitation",
      extractedStatus: classifyEmailStatus("Interview invitation"),
    });
    expect(tracker.get(app.id)!.status).toBe("INTERVIEW");

    // A late "application received" email must NOT move status backward.
    tracker.addEmailUpdate(app.id, {
      subject: "We received your application",
      extractedStatus: classifyEmailStatus("We received your application"),
    });
    expect(tracker.get(app.id)!.status).toBe("INTERVIEW");
  });

  it("persists tracking.json for the tracking page", () => {
    const app = tracker.create(job);
    const trackingPath = path.join(dir, "applications", app.slug, "tracking.json");
    expect(fs.existsSync(trackingPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(trackingPath, "utf8"));
    expect(parsed.number).toBe(1);
    expect(parsed.timeline.length).toBeGreaterThan(0);
  });
});
