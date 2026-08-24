import { z } from "zod";

/**
 * Structured representation of a parsed resume.
 *
 * The ResumeParser produces this from raw PDF/DOCX text. It is deliberately
 * conservative: fields are only populated when they can be reasonably inferred
 * from the document. Nothing here is ever invented — a missing section stays
 * empty rather than being fabricated.
 */

export const ContactInfo = z.object({
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
  websites: z.array(z.string()).default([]),
});
export type ContactInfo = z.infer<typeof ContactInfo>;

export const ExperienceItem = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  current: z.boolean().default(false),
  bullets: z.array(z.string()).default([]),
  /** Raw text block for this item, kept for optimizer re-ordering. */
  raw: z.string().optional(),
});
export type ExperienceItem = z.infer<typeof ExperienceItem>;

export const EducationItem = z.object({
  degree: z.string().optional(),
  field: z.string().optional(),
  institution: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  raw: z.string().optional(),
});
export type EducationItem = z.infer<typeof EducationItem>;

export const ProjectItem = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  raw: z.string().optional(),
});
export type ProjectItem = z.infer<typeof ProjectItem>;

export const ParsedResume = z.object({
  contact: ContactInfo,
  summary: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experience: z.array(ExperienceItem).default([]),
  education: z.array(EducationItem).default([]),
  projects: z.array(ProjectItem).default([]),
  certifications: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  /** The full plain-text of the resume — the ground-truth for keyword verification. */
  rawText: z.string(),
  /** Section headings detected, useful for formatting diagnostics. */
  detectedSections: z.array(z.string()).default([]),
  sourceFormat: z.enum(["pdf", "docx", "txt", "unknown"]).default("unknown"),
});
export type ParsedResume = z.infer<typeof ParsedResume>;
