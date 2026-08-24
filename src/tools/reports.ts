import { z } from "zod";
import { defineTool } from "./types.js";

/**
 * Reporting tools: generate the final PDF report and the HTML tracking pages.
 */
export const generateApplicationReport = defineTool({
  name: "generate_application_report",
  title: "Generate application report",
  description:
    "Generate the final professional PDF report (summary stats + application table + per-application detail sections) and the local HTML tracking pages (one per application, plus an index). Returns the file paths so the user can open/download them.",
  inputSchema: z.object({
    includeTrackingPages: z.boolean().optional().default(true),
  }),
  async handler(ctx, args) {
    const apps = ctx.tracker.list();
    if (apps.length === 0) {
      return {
        summary: "No applications yet — analyze a job first, then generate the report.",
        isError: true,
      };
    }
    const pdfPath = await ctx.reports.generatePdfReport();
    let tracking: { indexPath: string; pages: string[] } | undefined;
    if (args.includeTrackingPages !== false) {
      tracking = await ctx.reports.generateTrackingPages();
    }
    const summary = ctx.reports.summary(apps);
    return {
      summary: `Report generated for ${apps.length} application(s). PDF: ${pdfPath}${tracking ? ` · Tracking index: ${tracking.indexPath}` : ""}.`,
      data: {
        reportPdf: pdfPath,
        trackingIndex: tracking?.indexPath,
        trackingPages: tracking?.pages,
        summary,
      },
    };
  },
});

export const reportTools = [generateApplicationReport];
