import { z } from "zod";
import { defineTool } from "./types.js";
import { ApplicationStatus } from "../models/common.js";
import { classifyEmailStatus } from "../providers/email/EmailProvider.js";

/**
 * Tracking tools: search_application_emails, update_application_tracking.
 */

export const searchApplicationEmails = defineTool({
  name: "search_application_emails",
  title: "Search application emails",
  description:
    "Search the connected email provider for messages related to an application (by company, role, recruiter email, or domain), classify each into a status (APPLICATION_RECEIVED, SCREENING, INTERVIEW, OFFER, REJECTED, ...), and update the application's tracking. Phase 1 uses an offline mock provider (seed it in tests/demos); Phase 5 connects Gmail via OAuth (read-only, no passwords stored).",
  inputSchema: z.object({
    application: z.number().int().positive(),
    recruiterEmail: z.string().optional(),
    domain: z.string().optional(),
    since: z.string().optional().describe("ISO date; only newer messages."),
  }),
  async handler(ctx, args) {
    const app = ctx.tracker.getByNumber(args.application);
    if (!app) return { summary: `No application #${args.application}.`, isError: true };
    if (!(await ctx.email.isReady())) {
      return {
        summary:
          "No email provider is connected yet (Phase 5 connects Gmail via OAuth). Nothing to search.",
        data: { provider: ctx.email.id, ready: false },
      };
    }

    const results = await ctx.email.search({
      company: app.company,
      role: app.role,
      recruiterEmail: args.recruiterEmail,
      domain: args.domain,
      since: args.since,
    });

    let applied = 0;
    for (const e of results) {
      const status = e.extractedStatus ?? classifyEmailStatus(`${e.subject ?? ""} ${e.snippet ?? ""}`);
      ctx.tracker.addEmailUpdate(app.id, { ...e, extractedStatus: status });
      if (status) applied++;
    }
    const refreshed = ctx.tracker.getByNumber(app.number)!;
    return {
      summary: `Found ${results.length} email(s) for #${app.number}; ${applied} carried a status signal. Current status: ${refreshed.status}.`,
      data: {
        provider: ctx.email.id,
        emails: results,
        currentStatus: refreshed.status,
        timeline: ctx.tracker.timeline(refreshed),
      },
    };
  },
});

export const updateApplicationTracking = defineTool({
  name: "update_application_tracking",
  title: "Update application tracking",
  description:
    "Manually update an application's tracking: set a new status (with timestamped history) and/or attach an email update. Use to record interviews, offers, rejections, or withdrawals.",
  inputSchema: z.object({
    application: z.number().int().positive(),
    status: ApplicationStatus.optional(),
    note: z.string().optional(),
    email: z
      .object({
        sender: z.string().optional(),
        subject: z.string().optional(),
        date: z.string().optional(),
        snippet: z.string().optional(),
      })
      .optional(),
  }),
  async handler(ctx, args) {
    const app = ctx.tracker.getByNumber(args.application);
    if (!app) return { summary: `No application #${args.application}.`, isError: true };

    if (args.email) {
      const status = classifyEmailStatus(`${args.email.subject ?? ""} ${args.email.snippet ?? ""}`);
      ctx.tracker.addEmailUpdate(app.id, { ...args.email, extractedStatus: status });
    }
    if (args.status) {
      ctx.tracker.setStatus(app.id, args.status, args.note, "user");
    }
    const refreshed = ctx.tracker.getByNumber(app.number)!;
    return {
      summary: `Updated application #${app.number}. Status: ${refreshed.status}.`,
      data: { application: refreshed, timeline: ctx.tracker.timeline(refreshed) },
    };
  },
});

export const trackingTools = [searchApplicationEmails, updateApplicationTracking];
