import type { StructuredJob, MasterProfile } from "../../models/index.js";
import type {
  ApplicationAdapter,
  ApplicationAdapterCapabilities,
  PreparedApplication,
  ApplicationSubmitResult,
} from "./ApplicationAdapter.js";

/**
 * Phase 1 application adapter.
 *
 * It prepares everything for a human-in-the-loop application: it computes the
 * autofill field map and the known/unknown questions from the VERIFIED profile,
 * and points at the customized resume — but it never claims it can auto-submit
 * an arbitrary website. `submit` always returns PAUSED_FOR_USER, honestly
 * telling the user to complete the application themselves.
 *
 * Real automation adapters (LinkedIn Easy Apply, Greenhouse, company career
 * pages, ...) implement the same interface in Phase 4 and only auto-submit
 * where it is technically and legally supported, pausing for any human-only
 * step (CAPTCHA / OTP / 2FA / identity / legal declarations).
 */
export class ManualApplicationAdapter implements ApplicationAdapter {
  readonly id = "manual";
  readonly label = "Manual (human-in-the-loop)";
  readonly capabilities: ApplicationAdapterCapabilities = {
    canAutofill: true,
    canAttachResume: true,
    canSubmit: false,
    requiresAuth: false,
  };

  async prepare(
    job: StructuredJob,
    profile: MasterProfile,
    resumePath?: string,
  ): Promise<PreparedApplication> {
    const autofillFields: Record<string, string> = {};
    const put = (k: string, v?: string) => {
      if (v && v.trim()) autofillFields[k] = v.trim();
    };
    put("full_name", profile.fullName);
    put("email", profile.email);
    put("phone", profile.phone);
    put("location", profile.location);
    put("linkedin", profile.linkedin);
    put("github", profile.github);
    put("portfolio", profile.portfolio);
    put("work_authorization", profile.workAuthorization);
    put("notice_period", profile.noticePeriod);
    put("salary_expectation", profile.salaryExpectation);
    put("work_mode_preference", profile.workModePreference);
    if (profile.requiresSponsorship !== undefined)
      put("requires_sponsorship", profile.requiresSponsorship ? "Yes" : "No");
    if (profile.relocationPreference !== undefined)
      put("willing_to_relocate", profile.relocationPreference ? "Yes" : "No");

    // Known reusable answers.
    const answeredQuestions = Object.entries(profile.reusableAnswers).map(([q, a]) => ({
      question: q,
      answer: a,
    }));

    // Common application questions we can only answer if verified.
    const unknownQuestions: string[] = [];
    const need = (label: string, have: boolean) => {
      if (!have) unknownQuestions.push(label);
    };
    need("Are you legally authorized to work in the job's location?", !!profile.workAuthorization);
    need("Do you now or in the future require sponsorship?", profile.requiresSponsorship !== undefined);
    if (job.visaRequirements) {
      unknownQuestions.push(`Visa/work-authorization declaration for: ${job.visaRequirements}`);
    }

    return { autofillFields, answeredQuestions, unknownQuestions, resumePath };
  }

  async submit(
    job: StructuredJob,
    prepared: PreparedApplication,
  ): Promise<ApplicationSubmitResult> {
    const pending = [
      `Open the application page${job.applicationUrl ? `: ${job.applicationUrl}` : ""} and log in yourself if required.`,
      "Review and paste the pre-filled fields (ResumePilot never stores your passwords).",
      prepared.resumePath
        ? `Attach the customized resume: ${prepared.resumePath}`
        : "Attach your customized resume.",
      ...(prepared.unknownQuestions.length
        ? [`Answer these yourself (not guessed): ${prepared.unknownQuestions.join(" | ")}`]
        : []),
      "Complete any CAPTCHA / OTP / 2FA / identity / legal declaration steps yourself.",
      "Submit, then tell ResumePilot to mark this application as APPLIED.",
    ];
    return {
      status: "PAUSED_FOR_USER",
      pendingManualActions: pending,
      reasons: ["LOGIN_REQUIRED", "LEGAL_DECLARATION"],
      message:
        "Phase 1 does not auto-submit to external sites. Everything is prepared for you to apply manually in a few clicks.",
    };
  }
}
