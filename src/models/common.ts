import { z } from "zod";

/**
 * Shared primitives used across ResumePilot schemas.
 */

export const IsoDateTime = z
  .string()
  .describe("ISO-8601 timestamp, e.g. 2026-08-24T10:15:00.000Z");

export const WorkMode = z.enum(["remote", "hybrid", "on-site", "unknown"]);
export type WorkMode = z.infer<typeof WorkMode>;

/**
 * Application lifecycle statuses. These map 1:1 to the statuses in the product
 * spec and are persisted with a timestamped history.
 */
export const ApplicationStatus = z.enum([
  "DISCOVERED",
  "ANALYZING",
  "CUSTOMIZED",
  "READY_TO_APPLY",
  "APPLIED",
  "APPLICATION_RECEIVED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "UNKNOWN",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

/** Ordered lifecycle used for timeline rendering and "furthest reached" logic. */
export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "DISCOVERED",
  "ANALYZING",
  "CUSTOMIZED",
  "READY_TO_APPLY",
  "APPLIED",
  "APPLICATION_RECEIVED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
];

/** Terminal statuses that can occur at any point. */
export const TERMINAL_STATUSES: ApplicationStatus[] = [
  "REJECTED",
  "WITHDRAWN",
];

export const Score = z
  .number()
  .min(0)
  .max(100)
  .describe("A 0-100 score.");
