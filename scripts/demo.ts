/**
 * End-to-end demo of the ResumePilot Phase 1 pipeline, driven through the same
 * tool handlers Claude Desktop calls. Run with: `npm run build && npm run demo`.
 *
 * It uses a temporary data directory so it never touches your real data.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ResumePilotContext } from "../src/context.js";
import { allTools } from "../src/tools/index.js";
import type { MockEmailProvider } from "../src/providers/email/MockEmailProvider.js";

const SAMPLE_RESUME = `Rajesh Dhamotharan
rajesh@example.com | +91 98765 43210 | Chennai, India | https://github.com/rajesh | https://linkedin.com/in/rajesh

SUMMARY
Full stack engineer with 6 years building web applications and data-heavy dashboards.

SKILLS
JavaScript, React, Node.js, Python, PostgreSQL, Docker, AWS, REST APIs, Git, Agile

EXPERIENCE
Senior Software Engineer at Acme Corp  2021 - Present
- Built React applications used by 40,000 monthly users
- Designed REST APIs in Node.js serving 2M requests per day
- Migrated a legacy service to TypeScript, cutting runtime errors by 30%
- Set up CI/CD pipelines reducing deployment time by 50%

Software Engineer at Beta Labs  2019 - 2021
- Developed Python data pipelines processing 500GB daily
- Responsible for maintaining PostgreSQL databases

EDUCATION
B.Tech in Computer Science, Anna University, 2019

CERTIFICATIONS
AWS Certified Developer Associate

LANGUAGES
English, Tamil, Hindi`;

const SAMPLE_JD = `Senior Frontend Engineer at Globex

We are looking for a Senior Frontend Engineer to join our platform team.

Responsibilities:
- Build and maintain React and TypeScript applications
- Design and consume REST APIs
- Collaborate with designers and backend engineers

Requirements:
- 5+ years of experience in frontend development
- Strong React and TypeScript skills
- Experience with REST APIs and modern build tooling
- Familiarity with CI/CD

Preferred:
- GraphQL experience
- Experience with AWS
- Kubernetes knowledge

This is a hybrid role based in Chennai. Bachelor's degree preferred.`;

async function call(ctx: ResumePilotContext, name: string, args: unknown) {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) throw new Error(`No tool ${name}`);
  const parsed = tool.inputSchema.parse(args ?? {});
  const res = await tool.handler(ctx, parsed);
  console.log(`\n=== ${name} ===`);
  console.log(res.summary);
  return res;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resumepilot-demo-"));
  const ctx = ResumePilotContext.create({ ...process.env, RESUMEPILOT_DATA_DIR: dir });
  console.log("Demo data dir:", dir);

  await call(ctx, "upload_master_resume", { text: SAMPLE_RESUME });
  await call(ctx, "analyze_master_resume", {});
  await call(ctx, "setup_user_profile", {
    answers: {
      workAuthorization: "Indian citizen; needs sponsorship for US roles",
      workModePreference: "hybrid",
      noticePeriod: "30 days",
      preferredRoles: "Senior Frontend Engineer, Full Stack Developer",
      totalYearsExperience: 6,
    },
  });

  const analyzed = await call(ctx, "analyze_job", {
    description: SAMPLE_JD,
    title: "Senior Frontend Engineer",
    company: "Globex",
  });
  const appNo = (analyzed.data as any).applicationNumber as number;

  await call(ctx, "optimize_resume_for_job", { application: appNo });
  await call(ctx, "generate_application_profile", { application: appNo });
  await call(ctx, "prepare_application", { application: appNo });
  await call(ctx, "apply_to_job", { application: appNo, markApplied: true });

  // Seed the offline mock inbox and run email tracking.
  (ctx.email as MockEmailProvider).seed([
    {
      sender: "recruiter@globex.com",
      subject: "We received your application for Senior Frontend Engineer",
      date: new Date().toISOString(),
      snippet: "Thank you for applying. Our team will review your application.",
    },
    {
      sender: "recruiter@globex.com",
      subject: "Interview invitation — Globex",
      date: new Date().toISOString(),
      snippet: "We would like to schedule a call. Please share your availability.",
    },
  ]);
  await call(ctx, "search_application_emails", { application: appNo, domain: "globex.com" });

  const report = await call(ctx, "generate_application_report", {});
  console.log("\nReport PDF:", (report.data as any).reportPdf);
  console.log("Tracking index:", (report.data as any).trackingIndex);

  ctx.close();
  console.log("\nDemo complete. Explore:", dir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
