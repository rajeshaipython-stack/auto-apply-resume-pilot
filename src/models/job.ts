import { z } from "zod";
import { WorkMode } from "./common.js";

/**
 * A job as ingested into the pipeline. In Phase 1 jobs arrive via manual JD
 * input (ManualJobSourceAdapter). In later phases the same shape is produced by
 * search adapters (LinkedIn, Indeed, Naukri, company career pages, ...).
 */

export const JobSource = z.object({
  /** Adapter id, e.g. "manual", "linkedin", "indeed". */
  adapter: z.string(),
  /** Human label, e.g. "Manual input", "LinkedIn". */
  label: z.string().optional(),
  /** Canonical URL of the posting, if known. */
  url: z.string().optional(),
  /** Original external id from the source, if any. */
  externalId: z.string().optional(),
});
export type JobSource = z.infer<typeof JobSource>;

/** Raw job as returned by a JobSourceAdapter before structured extraction. */
export const RawJob = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  description: z.string(),
  url: z.string().optional(),
  source: JobSource,
});
export type RawJob = z.infer<typeof RawJob>;

/** Structured job after JobAnalyzer extraction. */
export const StructuredJob = z.object({
  id: z.string(),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  workMode: WorkMode.default("unknown"),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  experienceRequirement: z.string().optional(),
  minYearsExperience: z.number().nonnegative().optional(),
  education: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  salary: z.string().optional(),
  visaRequirements: z.string().optional(),
  applicationUrl: z.string().optional(),
  source: JobSource,
  /** SHA-based fingerprint used for deduplication across sources. */
  fingerprint: z.string(),
  rawDescription: z.string(),
  createdAt: z.string().optional(),
});
export type StructuredJob = z.infer<typeof StructuredJob>;
