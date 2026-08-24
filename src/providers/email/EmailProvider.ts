import type { ApplicationStatus, EmailUpdate } from "../../models/index.js";

export interface EmailSearchQuery {
  company?: string;
  role?: string;
  recruiterEmail?: string;
  applicationReference?: string;
  domain?: string;
  /** Only messages after this ISO date. */
  since?: string;
  limit?: number;
}

/**
 * Provider interface for reading application/recruiter emails.
 *
 * Phase 5 wires a GmailProvider via OAuth (read-only scope). No passwords are
 * ever stored; tokens live in secure storage, never in logs. Additional
 * providers implement the same interface.
 */
export interface EmailProvider {
  readonly id: string;
  readonly label: string;
  isReady(): Promise<boolean>;
  connect?(): Promise<{ connected: boolean; message?: string }>;
  search(query: EmailSearchQuery): Promise<EmailUpdate[]>;
}

/** Keyword → status mapping used to classify recruiter emails. */
const STATUS_SIGNALS: { status: ApplicationStatus; patterns: RegExp[] }[] = [
  { status: "APPLICATION_RECEIVED", patterns: [/application (has been )?received/i, /thank you for applying/i, /we have received your application/i] },
  { status: "SCREENING", patterns: [/under review/i, /reviewing your (application|profile)/i, /shortlist/i] },
  { status: "INTERVIEW", patterns: [/interview/i, /schedule a call/i, /availability/i, /next round/i] },
  { status: "OFFER", patterns: [/offer letter/i, /pleased to offer/i, /job offer/i] },
  { status: "REJECTED", patterns: [/not moving forward/i, /unfortunately/i, /decided (not )?to proceed/i, /other candidates/i, /regret to inform/i] },
];

/** Classify an email's subject/snippet into a status signal (deterministic). */
export function classifyEmailStatus(text: string): ApplicationStatus | undefined {
  for (const sig of STATUS_SIGNALS) {
    if (sig.patterns.some((p) => p.test(text))) return sig.status;
  }
  return undefined;
}
