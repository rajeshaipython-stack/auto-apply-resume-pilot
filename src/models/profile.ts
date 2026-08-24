import { z } from "zod";
import { WorkMode } from "./common.js";

/**
 * The Master Profile: a single, reusable structured record of everything a job
 * application form might ask for. It is seeded from the parsed master resume,
 * then completed by asking the user ONLY for information that could not be
 * extracted. It is never silently invented.
 */

export const ProfileEducation = z.object({
  degree: z.string().optional(),
  field: z.string().optional(),
  institution: z.string().optional(),
  startYear: z.string().optional(),
  endYear: z.string().optional(),
  grade: z.string().optional(),
});
export type ProfileEducation = z.infer<typeof ProfileEducation>;

export const ProfileExperience = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  current: z.boolean().default(false),
  summary: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});
export type ProfileExperience = z.infer<typeof ProfileExperience>;

export const MasterProfile = z.object({
  // Identity / contact
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),

  // Substance
  summary: z.string().optional(),
  education: z.array(ProfileEducation).default([]),
  experience: z.array(ProfileExperience).default([]),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  totalYearsExperience: z.number().nonnegative().optional(),

  // Reusable application preferences / answers
  preferredRoles: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  workModePreference: WorkMode.default("unknown"),
  workAuthorization: z.string().optional(),
  visaRequirements: z.string().optional(),
  requiresSponsorship: z.boolean().optional(),
  noticePeriod: z.string().optional(),
  salaryExpectation: z.string().optional(),
  relocationPreference: z.boolean().optional(),

  /**
   * Free-form reusable answers to common application questions, keyed by a
   * normalized question label. e.g. { "willing_to_relocate": "Yes" }.
   * Only ever populated from user-provided answers.
   */
  reusableAnswers: z.record(z.string(), z.string()).default({}),

  updatedAt: z.string().optional(),
});
export type MasterProfile = z.infer<typeof MasterProfile>;

/** The set of fields ResumePilot considers when deciding what to ask the user. */
export const REQUIRED_PROFILE_FIELDS = [
  "fullName",
  "email",
  "phone",
  "location",
  "workAuthorization",
  "workModePreference",
  "noticePeriod",
  "salaryExpectation",
  "preferredRoles",
] as const;

/** A single question ResumePilot asks the user to complete the profile. */
export const ProfileQuestion = z.object({
  field: z.string(),
  question: z.string(),
  reason: z.string(),
  example: z.string().optional(),
  required: z.boolean().default(true),
});
export type ProfileQuestion = z.infer<typeof ProfileQuestion>;
