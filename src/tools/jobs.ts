import { z } from "zod";
import { defineTool } from "./types.js";
import type { StructuredJob, ATSAnalysis } from "../models/index.js";

/**
 * Job tools: connect_job_source, search_jobs, analyze_job, rank_jobs.
 *
 * Phase 1 supports manual job-description input end-to-end. `connect_job_source`
 * and `search_jobs` are honest about what is/ isn't available yet and describe
 * the adapter architecture that fills them in Phases 2-3.
 */

export const connectJobSource = defineTool({
  name: "connect_job_source",
  title: "Connect a job source",
  description:
    "Inspect or connect a job source adapter (professional networks, global/regional job boards, company career pages, public job APIs, supported ATS pages). Phase 1 has the `manual` source ready. Real search adapters connect via their OFFICIAL login/OAuth in later phases — ResumePilot never stores passwords or OTPs.",
  inputSchema: z.object({
    source: z
      .string()
      .optional()
      .describe("Adapter id to connect (e.g. 'manual'). Omit to list all sources."),
  }),
  async handler(ctx, args) {
    if (!args.source) {
      return {
        summary: "Available job source adapters. Only ready ones can be used now.",
        data: { sources: ctx.jobSources.describe() },
      };
    }
    const adapter = ctx.jobSources.get(args.source);
    if (!adapter) {
      return {
        summary: `Unknown source "${args.source}". Known: ${ctx.jobSources
          .list()
          .map((a) => a.id)
          .join(", ")}.`,
        isError: true,
      };
    }
    const ready = await adapter.isReady();
    let connectMsg: string | undefined;
    if (!ready && adapter.connect) {
      const res = await adapter.connect();
      connectMsg = res.message;
    }
    return {
      summary: ready
        ? `Source "${adapter.id}" is ready.`
        : `Source "${adapter.id}" requires its official authentication flow (planned for a later phase). ${connectMsg ?? ""}`.trim(),
      data: { id: adapter.id, label: adapter.label, capabilities: adapter.capabilities, ready },
    };
  },
});

export const searchJobs = defineTool({
  name: "search_jobs",
  title: "Search jobs",
  description:
    "Search connected job sources for relevant jobs (up to JOB_SEARCH_MAX_JOBS with JOB_SEARCH_CONCURRENCY workers). In Phase 1 no automated search source is connected yet — paste a job description into analyze_job instead. This tool returns the planned configuration and which sources could serve the query.",
  inputSchema: z.object({
    keywords: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    workMode: z.enum(["remote", "hybrid", "on-site"]).optional(),
    limit: z.number().int().positive().max(1000).optional(),
  }),
  async handler(ctx, args) {
    const searchable = ctx.jobSources.list().filter((a) => a.capabilities.canSearch);
    const ready: string[] = [];
    for (const a of searchable) if (await a.isReady()) ready.push(a.id);
    return {
      summary:
        ready.length === 0
          ? "No automated job-search source is connected yet (Phase 2+). For now, paste a job description into analyze_job to run the full pipeline."
          : `Would search ${ready.length} source(s): ${ready.join(", ")}.`,
      data: {
        query: args,
        config: {
          maxJobs: ctx.config.jobSearchMaxJobs,
          concurrency: ctx.config.jobSearchConcurrency,
        },
        searchableSources: searchable.map((a) => a.id),
        readySources: ready,
      },
    };
  },
});

export const analyzeJob = defineTool({
  name: "analyze_job",
  title: "Analyze a job",
  description:
    "Ingest a job (Phase 1: paste the description) and analyze it against the master resume + profile. Extracts structured job info, computes the ORIGINAL ATS/match scores, and identifies missing keywords, buried experience, weak bullets and unverifiable requirements (never invented). Creates a tracked application and returns its number. Follow with optimize_resume_for_job.",
  inputSchema: z.object({
    description: z.string().min(30).describe("The full job description text."),
    title: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    url: z.string().optional().describe("Application/posting URL, if any."),
  }),
  async handler(ctx, args) {
    const master = ctx.requireMasterResume();
    const profile = ctx.getProfile();

    const raw = ctx.manualJobAdapter().ingest(args);
    const job: StructuredJob = ctx.jobAnalyzer.analyze(raw);

    // Deduplicate: reuse existing job with same fingerprint if present.
    const existing = ctx.db.findJobByFingerprint(job.fingerprint);
    const finalJob = existing ?? job;
    if (!existing) ctx.db.saveJob(job);

    const original: ATSAnalysis = ctx.ats.analyze(
      { resumeText: master.rawText, prominentText: [master.summary, master.skills.join(", ")].filter(Boolean).join(" ") },
      finalJob,
      profile,
    );

    const app = ctx.tracker.create(finalJob, { status: "DISCOVERED", note: "Ingested via manual input." });
    ctx.tracker.setOriginalAnalysis(app.id, original);

    return {
      summary: `Analyzed "${finalJob.title ?? "job"}"${finalJob.company ? ` at ${finalJob.company}` : ""}. Original ATS ${original.atsScore}, match ${original.overallMatchScore}. Created application #${app.number}. Run optimize_resume_for_job with application ${app.number}.`,
      data: {
        applicationNumber: app.number,
        applicationId: app.id,
        job: {
          title: finalJob.title,
          company: finalJob.company,
          location: finalJob.location,
          workMode: finalJob.workMode,
          requiredSkills: finalJob.requiredSkills,
          preferredSkills: finalJob.preferredSkills,
          minYearsExperience: finalJob.minYearsExperience,
          keywords: finalJob.keywords,
          salary: finalJob.salary,
          visaRequirements: finalJob.visaRequirements,
        },
        original: {
          atsScore: original.atsScore,
          matchScore: original.overallMatchScore,
          breakdown: original.breakdown,
          missingKeywords: original.missingKeywords,
          presentButBuriedKeywords: original.presentButBuriedKeywords,
          gaps: original.gaps,
        },
      },
    };
  },
});

export const rankJobs = defineTool({
  name: "rank_jobs",
  title: "Rank analyzed jobs",
  description:
    "Rank all analyzed applications by overall match score (ATS as tiebreaker) and flag which clear the MATCH_SCORE_THRESHOLD for applying.",
  inputSchema: z.object({
    threshold: z.number().min(0).max(100).optional(),
  }),
  async handler(ctx, args) {
    const apps = ctx.tracker.list();
    const items = apps
      .map((a) => {
        const job = ctx.db.getJob(a.jobId);
        if (!job) return undefined;
        // Reconstruct a lightweight analysis view from stored scores.
        const analysis = {
          overallMatchScore: a.matchScore ?? 0,
          atsScore: a.optimizedAtsScore ?? a.originalAtsScore ?? 0,
        } as ATSAnalysis;
        return { job, analysis, app: a };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const ranked = ctx.ranker.rank(
      items.map((i) => ({ job: i.job, analysis: i.analysis })),
      { threshold: args.threshold ?? ctx.config.matchScoreThreshold },
    );
    const byJob = new Map(items.map((i) => [i.job.id, i.app]));
    return {
      summary: `Ranked ${ranked.length} application(s). ${ranked.filter((r) => r.recommendedToApply).length} recommended to apply.`,
      data: {
        threshold: args.threshold ?? ctx.config.matchScoreThreshold,
        ranking: ranked.map((r) => ({
          rank: r.rank,
          applicationNumber: byJob.get(r.job.id)?.number,
          company: r.job.company,
          role: r.job.title,
          matchScore: r.analysis.overallMatchScore,
          atsScore: r.analysis.atsScore,
          recommendedToApply: r.recommendedToApply,
        })),
      },
    };
  },
});

export const jobTools = [connectJobSource, searchJobs, analyzeJob, rankJobs];
