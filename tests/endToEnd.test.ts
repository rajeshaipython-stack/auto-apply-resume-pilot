import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ResumePilotContext } from "../src/context.js";
import { allTools } from "../src/tools/index.js";
import type { MockEmailProvider } from "../src/providers/email/MockEmailProvider.js";
import { SAMPLE_RESUME, SAMPLE_JD } from "./fixtures.js";

let dir: string;
let ctx: ResumePilotContext;

async function call(name: string, args: unknown) {
  const tool = allTools.find((t) => t.name === name)!;
  const parsed = tool.inputSchema.parse(args ?? {});
  return tool.handler(ctx, parsed);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-e2e-"));
  ctx = ResumePilotContext.create({ ...process.env, RESUMEPILOT_DATA_DIR: dir });
});
afterEach(() => {
  ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("end-to-end pipeline via MCP tools", () => {
  it("runs upload → analyze → optimize → apply → track → report", async () => {
    await call("upload_master_resume", { text: SAMPLE_RESUME });
    const analyzed = await call("analyze_master_resume", {});
    expect((analyzed.data as any).missingQuestions.length).toBeGreaterThan(0);

    await call("setup_user_profile", {
      answers: { workAuthorization: "Citizen", workModePreference: "hybrid", preferredRoles: "Frontend Engineer", totalYearsExperience: 6 },
    });

    const job = await call("analyze_job", { description: SAMPLE_JD, title: "Senior Frontend Engineer", company: "Globex" });
    const appNo = (job.data as any).applicationNumber as number;
    expect(appNo).toBe(1);

    const opt = await call("optimize_resume_for_job", { application: appNo });
    const d = opt.data as any;
    expect(d.optimizedAtsScore).toBeGreaterThanOrEqual(d.originalAtsScore);
    expect(fs.existsSync(d.files.pdf)).toBe(true);
    expect(fs.existsSync(d.files.docx)).toBe(true);
    // The master resume file must remain untouched/immutable.
    expect(ctx.getMasterResume()!.rawText).toBe(SAMPLE_RESUME);

    await call("generate_application_profile", { application: appNo });
    const prep = await call("prepare_application", { application: appNo });
    expect((prep.data as any).checklist.length).toBeGreaterThan(0);

    await call("apply_to_job", { application: appNo, markApplied: true });
    expect(ctx.tracker.getByNumber(appNo)!.status).toBe("APPLIED");

    (ctx.email as MockEmailProvider).seed([
      { sender: "recruiter@globex.com", subject: "Interview invitation", date: new Date().toISOString(), snippet: "share your availability" },
    ]);
    await call("search_application_emails", { application: appNo, domain: "globex.com" });
    expect(ctx.tracker.getByNumber(appNo)!.status).toBe("INTERVIEW");

    const report = await call("generate_application_report", {});
    expect(fs.existsSync((report.data as any).reportPdf)).toBe(true);
    expect(fs.existsSync((report.data as any).trackingIndex)).toBe(true);
  });

  it("rank_jobs orders analyzed applications", async () => {
    await call("upload_master_resume", { text: SAMPLE_RESUME });
    await call("analyze_master_resume", {});
    await call("analyze_job", { description: SAMPLE_JD, company: "Globex" });
    const ranked = await call("rank_jobs", {});
    expect((ranked.data as any).ranking.length).toBe(1);
    expect((ranked.data as any).ranking[0].rank).toBe(1);
  });
});
