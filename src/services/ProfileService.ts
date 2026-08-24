import type {
  ParsedResume,
  MasterProfile,
  ProfileQuestion,
} from "../models/index.js";
import { REQUIRED_PROFILE_FIELDS } from "../models/profile.js";

/**
 * Builds and completes the Master Profile.
 *
 * The profile is seeded from the parsed resume, then ResumePilot asks the user
 * ONLY for information it could not extract (see {@link missingFieldQuestions}).
 * Answers are merged non-destructively; the same field is never asked twice
 * once answered.
 */
export class ProfileService {
  /** Seed a Master Profile from a parsed resume. Nothing is invented. */
  fromResume(resume: ParsedResume): MasterProfile {
    const c = resume.contact;
    return {
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      location: c.location,
      linkedin: c.linkedin,
      github: c.github,
      portfolio: c.portfolio,
      summary: resume.summary,
      education: resume.education.map((e) => ({
        degree: e.degree,
        field: e.field,
        institution: e.institution,
        startYear: e.startDate,
        endYear: e.endDate,
      })),
      experience: resume.experience.map((e) => ({
        title: e.title,
        company: e.company,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        current: e.current,
        bullets: e.bullets,
      })),
      skills: resume.skills,
      certifications: resume.certifications,
      languages: resume.languages,
      preferredRoles: [],
      preferredLocations: [],
      workModePreference: "unknown",
      reusableAnswers: {},
      updatedAt: new Date().toISOString(),
    };
  }

  /** Which important fields are still missing? Drives the questionnaire. */
  missingFields(profile: MasterProfile): string[] {
    const missing: string[] = [];
    for (const field of REQUIRED_PROFILE_FIELDS) {
      const v = (profile as Record<string, unknown>)[field];
      if (
        v === undefined ||
        v === null ||
        (typeof v === "string" && v.trim() === "") ||
        (Array.isArray(v) && v.length === 0) ||
        (field === "workModePreference" && v === "unknown")
      ) {
        missing.push(field);
      }
    }
    return missing;
  }

  private static QUESTIONS: Record<string, Omit<ProfileQuestion, "field">> = {
    fullName: {
      question: "What is your full name (as it should appear on applications)?",
      reason: "Could not confidently extract your name from the resume.",
      example: "Rajesh Dhamotharan",
      required: true,
    },
    email: {
      question: "What email address should applications use?",
      reason: "No email was detected in the resume.",
      example: "you@example.com",
      required: true,
    },
    phone: {
      question: "What is your phone number?",
      reason: "No phone number was detected.",
      example: "+91 98765 43210",
      required: true,
    },
    location: {
      question: "Where are you currently based (city, country)?",
      reason: "Location was not clearly detected.",
      example: "Chennai, India",
      required: true,
    },
    workAuthorization: {
      question: "What is your work authorization / right-to-work status?",
      reason: "Needed for many applications; not on the resume.",
      example: "Indian citizen; needs sponsorship for US roles",
      required: true,
    },
    workModePreference: {
      question: "Do you prefer remote, hybrid, or on-site work?",
      reason: "Used for location match scoring and application answers.",
      example: "remote",
      required: true,
    },
    noticePeriod: {
      question: "What is your notice period / availability to start?",
      reason: "Commonly asked on applications.",
      example: "30 days",
      required: false,
    },
    salaryExpectation: {
      question: "What is your salary expectation (optional)?",
      reason: "Frequently requested on applications.",
      example: "₹ 25-30 LPA / $120k",
      required: false,
    },
    preferredRoles: {
      question: "Which roles/titles are you targeting?",
      reason: "Used to rank and filter jobs.",
      example: "Senior Frontend Engineer, Full Stack Developer",
      required: true,
    },
  };

  /** Build the exact list of questions to ask, in priority order. */
  missingFieldQuestions(profile: MasterProfile): ProfileQuestion[] {
    return this.missingFields(profile).map((field) => {
      const base = ProfileService.QUESTIONS[field] ?? {
        question: `Please provide: ${field}`,
        reason: "Missing from profile.",
        required: false,
      };
      return { field, ...base };
    });
  }

  /**
   * Merge user-provided answers into the profile. Array-like fields accept
   * comma-separated strings. Never clears existing values with blanks.
   */
  applyAnswers(
    profile: MasterProfile,
    answers: Record<string, unknown>,
  ): MasterProfile {
    const next: MasterProfile = { ...profile, reusableAnswers: { ...profile.reusableAnswers } };
    const arrayFields = new Set(["preferredRoles", "preferredLocations", "skills", "languages", "certifications"]);
    const knownScalar = new Set([
      "fullName", "email", "phone", "location", "linkedin", "github", "portfolio",
      "summary", "workAuthorization", "visaRequirements", "noticePeriod",
      "salaryExpectation", "workModePreference",
    ]);

    for (const [key, raw] of Object.entries(answers)) {
      if (raw === undefined || raw === null) continue;
      if (arrayFields.has(key)) {
        const arr = Array.isArray(raw)
          ? raw.map(String)
          : String(raw)
              .split(/[,;\n]/)
              .map((s) => s.trim())
              .filter(Boolean);
        if (arr.length) (next as Record<string, unknown>)[key] = arr;
      } else if (key === "requiresSponsorship" || key === "relocationPreference") {
        (next as Record<string, unknown>)[key] = this.toBool(raw);
      } else if (key === "totalYearsExperience") {
        const n = Number(raw);
        if (Number.isFinite(n)) next.totalYearsExperience = n;
      } else if (knownScalar.has(key)) {
        const s = String(raw).trim();
        if (s) (next as Record<string, unknown>)[key] = s;
      } else {
        // Unknown -> store as a reusable answer.
        const s = String(raw).trim();
        if (s) next.reusableAnswers[key] = s;
      }
    }
    next.updatedAt = new Date().toISOString();
    return next;
  }

  private toBool(v: unknown): boolean {
    if (typeof v === "boolean") return v;
    return /^(y|yes|true|1)$/i.test(String(v).trim());
  }
}
