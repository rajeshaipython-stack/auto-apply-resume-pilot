import type { StructuredJob, ATSAnalysis, MasterProfile } from "../models/index.js";

export interface RankedJob {
  job: StructuredJob;
  analysis: ATSAnalysis;
  rank: number;
  recommendedToApply: boolean;
}

/**
 * Ranks analyzed jobs by overall match score (with ATS score as a tiebreaker),
 * and flags which clear a configurable apply threshold. Deterministic + pure so
 * it is trivially testable and works the same for 1 job (Phase 1) or 1,000
 * (Phase 2+).
 */
export class JobRanker {
  rank(
    items: { job: StructuredJob; analysis: ATSAnalysis }[],
    opts: { threshold?: number; profile?: MasterProfile } = {},
  ): RankedJob[] {
    const threshold = opts.threshold ?? 60;
    return items
      .slice()
      .sort(
        (a, b) =>
          b.analysis.overallMatchScore - a.analysis.overallMatchScore ||
          b.analysis.atsScore - a.analysis.atsScore,
      )
      .map((it, i) => ({
        job: it.job,
        analysis: it.analysis,
        rank: i + 1,
        recommendedToApply: it.analysis.overallMatchScore >= threshold,
      }));
  }

  /** Deduplicate jobs by fingerprint, keeping the first occurrence. */
  dedupe(jobs: StructuredJob[]): StructuredJob[] {
    const seen = new Set<string>();
    const out: StructuredJob[] = [];
    for (const j of jobs) {
      if (seen.has(j.fingerprint)) continue;
      seen.add(j.fingerprint);
      out.push(j);
    }
    return out;
  }
}
