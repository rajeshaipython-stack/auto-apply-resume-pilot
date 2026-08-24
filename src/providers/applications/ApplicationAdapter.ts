import type { StructuredJob, MasterProfile } from "../../models/index.js";

export type ManualActionReason =
  | "CAPTCHA"
  | "OTP"
  | "2FA"
  | "IDENTITY_VERIFICATION"
  | "LEGAL_DECLARATION"
  | "UNKNOWN_QUESTION"
  | "LOGIN_REQUIRED"
  | "UNSUPPORTED_SITE";

export interface PreparedApplication {
  /** Reusable fields we can safely pre-fill from the verified profile. */
  autofillFields: Record<string, string>;
  /** Application questions whose answers are known & verified. */
  answeredQuestions: { question: string; answer: string }[];
  /** Questions we do NOT have a verified answer for — never guessed. */
  unknownQuestions: string[];
  /** Path to the customized resume to attach. */
  resumePath?: string;
}

export interface ApplicationSubmitResult {
  status: "SUBMITTED" | "PAUSED_FOR_USER" | "UNSUPPORTED" | "FAILED";
  /** Human-only actions the user must complete themselves. */
  pendingManualActions: string[];
  reasons: ManualActionReason[];
  message: string;
}

export interface ApplicationAdapterCapabilities {
  canAutofill: boolean;
  canAttachResume: boolean;
  canSubmit: boolean;
  requiresAuth: boolean;
}

/**
 * Provider interface for application automation.
 *
 * Hard rules every adapter MUST follow:
 *  - Fill only reusable, verified profile fields.
 *  - Answer a question only when the answer is known & verified — never guess
 *    legal/declaration answers.
 *  - Attach the correct customized resume.
 *  - PAUSE and hand control back for any human-only step: CAPTCHA, OTP, 2FA,
 *    identity verification, legal declarations.
 *  - Submit only when it is technically and legally supported.
 *  - Never bypass authentication or anti-bot protections.
 */
export interface ApplicationAdapter {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ApplicationAdapterCapabilities;

  prepare(
    job: StructuredJob,
    profile: MasterProfile,
    resumePath?: string,
  ): Promise<PreparedApplication>;

  submit(
    job: StructuredJob,
    prepared: PreparedApplication,
  ): Promise<ApplicationSubmitResult>;
}
