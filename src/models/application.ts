import { z } from "zod";
import { ApplicationStatus } from "./common.js";

/**
 * Application record + its immutable, per-job resume version and tracking.
 */

export const StatusHistoryEntry = z.object({
  status: ApplicationStatus,
  at: z.string(),
  note: z.string().optional(),
  /** Where this update came from: system | user | email:<provider> | adapter:<id> */
  source: z.string().default("system"),
});
export type StatusHistoryEntry = z.infer<typeof StatusHistoryEntry>;

/** A discovered email relevant to an application (Phase 5; modeled now). */
export const EmailUpdate = z.object({
  sender: z.string().optional(),
  subject: z.string().optional(),
  date: z.string().optional(),
  snippet: z.string().optional(),
  extractedStatus: ApplicationStatus.optional(),
  messageRef: z.string().optional(),
});
export type EmailUpdate = z.infer<typeof EmailUpdate>;

export const ApplicationRecord = z.object({
  id: z.string(),
  /** Sequential human-facing number, e.g. 1 -> application-001. */
  number: z.number().int().positive(),
  slug: z.string(),

  jobId: z.string(),
  company: z.string().optional(),
  role: z.string().optional(),
  jobSourceAdapter: z.string(),
  jobUrl: z.string().optional(),

  status: ApplicationStatus,
  statusHistory: z.array(StatusHistoryEntry).default([]),

  originalAtsScore: z.number().min(0).max(100).optional(),
  optimizedAtsScore: z.number().min(0).max(100).optional(),
  matchScore: z.number().min(0).max(100).optional(),

  resumeVersion: z.string().optional(),
  resumePdfPath: z.string().optional(),
  resumeDocxPath: z.string().optional(),

  appliedAt: z.string().optional(),
  emailUpdates: z.array(EmailUpdate).default([]),

  /** Manual actions the user must complete (CAPTCHA/OTP/2FA/declarations). */
  pendingManualActions: z.array(z.string()).default([]),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ApplicationRecord = z.infer<typeof ApplicationRecord>;
