import { z } from "zod";
import { Score } from "./common.js";

/**
 * ATS + match analysis of a resume against a specific job.
 *
 * Every score is deterministic and reproducible so it can be unit-tested and
 * so "original vs optimized" comparisons are meaningful. Nothing here fabricates
 * skills: a required keyword that is not verifiable from the user's resume/profile
 * is reported as a gap, never silently added.
 */

export const KeywordMatch = z.object({
  keyword: z.string(),
  /** Was this keyword found (verified) in the resume/profile? */
  present: z.boolean(),
  /** How prominently — 0 (absent) .. 1 (in skills/summary and body). */
  prominence: z.number().min(0).max(1),
  /** Where it was found. */
  foundIn: z.array(z.string()).default([]),
});
export type KeywordMatch = z.infer<typeof KeywordMatch>;

export const ScoreBreakdown = z.object({
  skillMatch: Score,
  keywordMatch: Score,
  experienceMatch: Score,
  qualificationMatch: Score,
  locationMatch: Score,
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

/** A gap the optimizer surfaces but must NEVER auto-fill by inventing content. */
export const Gap = z.object({
  type: z.enum([
    "missing_keyword",
    "missing_skill",
    "missing_qualification",
    "missing_certification",
    "buried_experience",
    "weak_bullet",
    "missing_measurable_achievement",
    "formatting_risk",
    "unverified_requirement",
  ]),
  detail: z.string(),
  /** Actionable recommendation. For unverifiable items this says "cannot verify". */
  recommendation: z.string(),
  /** True when the item genuinely cannot be supported by existing content. */
  requiresUserInput: z.boolean().default(false),
});
export type Gap = z.infer<typeof Gap>;

export const ATSAnalysis = z.object({
  overallMatchScore: Score,
  atsScore: Score,
  breakdown: ScoreBreakdown,
  keywordMatches: z.array(KeywordMatch).default([]),
  missingKeywords: z.array(z.string()).default([]),
  presentButBuriedKeywords: z.array(z.string()).default([]),
  gaps: z.array(Gap).default([]),
  recommendations: z.array(z.string()).default([]),
  /** Which resume text this analysis was computed against (hash for provenance). */
  resumeTextHash: z.string().optional(),
  analyzedAt: z.string().optional(),
});
export type ATSAnalysis = z.infer<typeof ATSAnalysis>;

/** Result of optimizing a resume for a job: before/after + the changes made. */
export const OptimizationResult = z.object({
  original: ATSAnalysis,
  optimized: ATSAnalysis,
  changesMade: z.array(z.string()).default([]),
  /** Requirements that could not be met from existing content (never invented). */
  unverifiedRequirements: z.array(z.string()).default([]),
  optimizedResumeText: z.string(),
});
export type OptimizationResult = z.infer<typeof OptimizationResult>;
