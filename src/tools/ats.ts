import path from "node:path";
import { z } from "zod";
import { defineTool } from "./types.js";

/**
 * ATS optimization tool: create a job-specific, tailored resume from the
 * immutable master — surfacing and reordering only VERIFIED content — and
 * produce before/after ATS scores plus PDF & DOCX files.
 */
export const optimizeResumeForJob = defineTool({
  name: "optimize_resume_for_job",
  title: "Optimize resume for a job",
  description:
    "Generate a job-specific tailored resume for a tracked application. Surfaces already-demonstrated keywords, reorders skills/bullets, and adds a role-targeted summary — using ONLY information genuinely present in the master resume/profile. Never invents skills, experience, education or certifications. Produces PDF + DOCX and returns original vs optimized ATS scores, the changes made, and any requirements that could not be verified.",
  inputSchema: z.object({
    application: z
      .number()
      .int()
      .positive()
      .describe("The application number returned by analyze_job."),
    targetScore: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Target ATS score (default from ATS_TARGET_SCORE). Not guaranteed."),
  }),
  async handler(ctx, args) {
    const app = ctx.tracker.getByNumber(args.application);
    if (!app) return { summary: `No application #${args.application}.`, isError: true };
    const job = ctx.db.getJob(app.jobId);
    if (!job) return { summary: `Job for application #${args.application} not found.`, isError: true };

    const master = ctx.requireMasterResume();
    const profile = ctx.getProfile();
    const target = args.targetScore ?? ctx.config.atsTargetScore;

    const { result, optimized } = ctx.optimizer.buildOptimizedResume(
      master,
      job,
      profile,
      target,
    );

    // Generate immutable customized resume files inside the application dir.
    const dir = ctx.tracker.dirFor(app);
    const pdfPath = path.join(dir, "customized-resume.pdf");
    const docxPath = path.join(dir, "customized-resume.docx");
    await ctx.docs.generatePdf(optimized.resume, pdfPath);
    await ctx.docs.generateDocx(optimized.resume, docxPath);

    ctx.tracker.attachAnalysis(app.id, result.original, result.optimized);
    if (profile) ctx.tracker.attachProfile(app.id, profile);
    ctx.tracker.attachResume(app.id, { pdfPath, docxPath, version: app.slug });

    return {
      summary: `Optimized resume for application #${app.number}. ATS ${result.original.atsScore} → ${result.optimized.atsScore} (target ${target}), match ${result.optimized.overallMatchScore}. ${result.unverifiedRequirements.length} requirement(s) could not be verified and were NOT invented. Files saved in ${app.slug}/.`,
      data: {
        applicationNumber: app.number,
        originalAtsScore: result.original.atsScore,
        optimizedAtsScore: result.optimized.atsScore,
        matchScore: result.optimized.overallMatchScore,
        breakdownBefore: result.original.breakdown,
        breakdownAfter: result.optimized.breakdown,
        changesMade: result.changesMade,
        unverifiedRequirements: result.unverifiedRequirements,
        missingKeywords: result.optimized.missingKeywords,
        recommendations: result.optimized.recommendations,
        files: { pdf: pdfPath, docx: docxPath },
      },
    };
  },
});

export const atsTools = [optimizeResumeForJob];
