import { z } from "zod";
import { defineTool } from "./types.js";

/**
 * Application tools: generate_application_profile, prepare_application,
 * apply_to_job, get_application_status.
 */

export const generateApplicationProfile = defineTool({
  name: "generate_application_profile",
  title: "Generate application profile",
  description:
    "Build the job-specific application profile: the reusable fields ResumePilot can safely autofill from the VERIFIED master profile, the known answers, and the questions that must be answered by the user (never guessed — especially legal/declaration answers).",
  inputSchema: z.object({
    application: z.number().int().positive(),
  }),
  async handler(ctx, args) {
    const app = ctx.tracker.getByNumber(args.application);
    if (!app) return { summary: `No application #${args.application}.`, isError: true };
    const job = ctx.db.getJob(app.jobId);
    if (!job) return { summary: `Job not found for #${args.application}.`, isError: true };
    const profile = ctx.requireProfile();

    const adapter = ctx.appAdapters.resolveFor(app.jobSourceAdapter);
    const prepared = await adapter.prepare(job, profile, app.resumePdfPath);
    ctx.tracker.attachProfile(app.id, profile);

    return {
      summary: `Application profile ready for #${app.number}. ${Object.keys(prepared.autofillFields).length} field(s) can be autofilled; ${prepared.unknownQuestions.length} question(s) need the user's own answer.`,
      data: {
        applicationNumber: app.number,
        autofillFields: prepared.autofillFields,
        answeredQuestions: prepared.answeredQuestions,
        unknownQuestions: prepared.unknownQuestions,
        resumeToAttach: prepared.resumePath,
      },
    };
  },
});

export const prepareApplication = defineTool({
  name: "prepare_application",
  title: "Prepare application",
  description:
    "Prepare everything needed to apply: autofill map, customized resume to attach, and a step-by-step manual checklist. In Phase 1 nothing is auto-submitted to external sites — the application is set to READY_TO_APPLY and any human-only steps (login, CAPTCHA, OTP, 2FA, identity, legal declarations) are listed for the user.",
  inputSchema: z.object({
    application: z.number().int().positive(),
  }),
  async handler(ctx, args) {
    const app = ctx.tracker.getByNumber(args.application);
    if (!app) return { summary: `No application #${args.application}.`, isError: true };
    const job = ctx.db.getJob(app.jobId);
    if (!job) return { summary: `Job not found for #${args.application}.`, isError: true };
    const profile = ctx.requireProfile();

    const adapter = ctx.appAdapters.resolveFor(app.jobSourceAdapter);
    const prepared = await adapter.prepare(job, profile, app.resumePdfPath);
    const submit = await adapter.submit(job, prepared);

    ctx.tracker.addPendingManualActions(app.id, submit.pendingManualActions);
    ctx.tracker.setStatus(app.id, "READY_TO_APPLY", submit.message, "system");

    return {
      summary: `Application #${app.number} is READY_TO_APPLY. ${submit.message}`,
      data: {
        applicationNumber: app.number,
        submitStatus: submit.status,
        reasons: submit.reasons,
        checklist: submit.pendingManualActions,
        autofillFields: prepared.autofillFields,
        resumeToAttach: prepared.resumePath,
        unknownQuestions: prepared.unknownQuestions,
      },
    };
  },
});

export const applyToJob = defineTool({
  name: "apply_to_job",
  title: "Apply to job",
  description:
    "Attempt to submit the application through the resolved application adapter. In Phase 1 the manual adapter never auto-submits to external sites: it returns PAUSED_FOR_USER with a checklist. Pass `markApplied: true` ONLY after the user confirms they submitted it themselves, to record it as APPLIED.",
  inputSchema: z.object({
    application: z.number().int().positive(),
    markApplied: z
      .boolean()
      .optional()
      .describe("Set true only when the user confirms they submitted the application."),
    note: z.string().optional(),
  }),
  async handler(ctx, args) {
    const app = ctx.tracker.getByNumber(args.application);
    if (!app) return { summary: `No application #${args.application}.`, isError: true };

    if (args.markApplied) {
      const updated = ctx.tracker.setStatus(app.id, "APPLIED", args.note ?? "User confirmed submission.", "user");
      return {
        summary: `Recorded application #${app.number} as APPLIED on ${updated.appliedAt}.`,
        data: { applicationNumber: app.number, status: updated.status, appliedAt: updated.appliedAt },
      };
    }

    const job = ctx.db.getJob(app.jobId)!;
    const profile = ctx.requireProfile();
    const adapter = ctx.appAdapters.resolveFor(app.jobSourceAdapter);
    const prepared = await adapter.prepare(job, profile, app.resumePdfPath);
    const submit = await adapter.submit(job, prepared);
    ctx.tracker.addPendingManualActions(app.id, submit.pendingManualActions);
    if (app.status !== "READY_TO_APPLY") {
      ctx.tracker.setStatus(app.id, "READY_TO_APPLY", submit.message, "system");
    }

    return {
      summary: `Application #${app.number}: ${submit.status}. ${submit.message} Complete the checklist, then call apply_to_job with markApplied:true.`,
      data: {
        applicationNumber: app.number,
        submitStatus: submit.status,
        checklist: submit.pendingManualActions,
      },
    };
  },
});

export const getApplicationStatus = defineTool({
  name: "get_application_status",
  title: "Get application status",
  description:
    "Return the status, scores and timeline of one application (by number) or all applications.",
  inputSchema: z.object({
    application: z.number().int().positive().optional(),
  }),
  async handler(ctx, args) {
    if (args.application) {
      const app = ctx.tracker.getByNumber(args.application);
      if (!app) return { summary: `No application #${args.application}.`, isError: true };
      return {
        summary: `Application #${app.number} — ${app.company ?? ""} — ${app.status}.`,
        data: {
          application: app,
          timeline: ctx.tracker.timeline(app),
        },
      };
    }
    const apps = ctx.tracker.list();
    return {
      summary: `${apps.length} application(s).`,
      data: {
        applications: apps.map((a) => ({
          number: a.number,
          company: a.company,
          role: a.role,
          status: a.status,
          originalAtsScore: a.originalAtsScore,
          optimizedAtsScore: a.optimizedAtsScore,
          matchScore: a.matchScore,
          pendingManualActions: a.pendingManualActions.length,
        })),
      },
    };
  },
});

export const applicationTools = [
  generateApplicationProfile,
  prepareApplication,
  applyToJob,
  getApplicationStatus,
];
