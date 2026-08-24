import type {
  ParsedResume,
  StructuredJob,
  MasterProfile,
  OptimizationResult,
  ATSAnalysis,
} from "../models/index.js";
import { ATSAnalyzer } from "./ATSAnalyzer.js";
import { canonicalize, extractKeywordSet, normalizeText } from "../utils/text.js";

export interface OptimizedResume {
  resume: ParsedResume;
  text: string;
  prominentText: string;
}

/**
 * Tailors a resume for a specific job WITHOUT inventing anything.
 *
 * The only transformations performed are:
 *   1. Surfacing keywords the user genuinely already demonstrates (present in
 *      the body) up into the Skills section / summary.
 *   2. Re-ordering skills and experience bullets so job-relevant, already-true
 *      content leads.
 *   3. Writing a role-targeted summary composed ONLY of verified strengths.
 *
 * Required skills that cannot be verified from the user's resume/profile are
 * returned in `unverifiedRequirements` and are never added.
 */
export class ResumeOptimizer {
  constructor(private ats = new ATSAnalyzer()) {}

  optimize(
    master: ParsedResume,
    job: StructuredJob,
    profile?: MasterProfile,
    targetScore = 90,
  ): OptimizationResult {
    // 1. Score the master resume as-is.
    const original: ATSAnalysis = this.ats.analyze(
      {
        resumeText: master.rawText,
        prominentText: this.prominentText(master),
      },
      job,
      profile,
    );

    const verified = extractKeywordSet(
      master.rawText + " " + (profile?.skills ?? []).join(" "),
    );
    const changes: string[] = [];

    // 2. Surface buried keywords into the skills list (they are already true).
    const surfaced = original.presentButBuriedKeywords.filter((k) => verified.has(k));
    const optimizedSkills = this.rebuildSkills(master.skills, job, surfaced);
    if (surfaced.length > 0) {
      changes.push(
        `Surfaced ${surfaced.length} already-demonstrated keyword(s) into the Skills section: ${surfaced.join(", ")}.`,
      );
    }

    // 3. Reorder skills so job-relevant ones lead.
    const jobSkillSet = new Set(
      [...job.requiredSkills, ...job.preferredSkills, ...job.keywords].map(canonicalize),
    );
    const reordered = this.reorderByRelevance(optimizedSkills, jobSkillSet);
    if (this.orderChanged(optimizedSkills, reordered)) {
      changes.push("Reordered skills to lead with the most job-relevant, verified skills.");
    }

    // 4. Reorder experience bullets to lead with relevant, true achievements.
    let bulletMoves = 0;
    const optimizedExperience = master.experience.map((exp) => {
      const sorted = this.reorderBullets(exp.bullets, jobSkillSet);
      if (this.orderChanged(exp.bullets, sorted)) bulletMoves++;
      return { ...exp, bullets: sorted };
    });
    if (bulletMoves > 0) {
      changes.push(
        `Reordered bullets in ${bulletMoves} experience entr${bulletMoves === 1 ? "y" : "ies"} to lead with job-relevant results.`,
      );
    }

    // 5. Role-targeted summary from verified strengths only.
    const matchedVerifiedSkills = reordered.filter((s) =>
      jobSkillSet.has(canonicalize(s)),
    );
    const tailoredSummary = this.buildSummary(master.summary, job, matchedVerifiedSkills);
    if (tailoredSummary && tailoredSummary !== master.summary) {
      changes.push("Added a role-targeted summary highlighting verified strengths (no new claims).");
    }

    const optimizedResume: ParsedResume = {
      ...master,
      summary: tailoredSummary,
      skills: reordered,
      experience: optimizedExperience,
    };
    const rendered = this.render(optimizedResume);
    optimizedResume.rawText = rendered.text;

    // 6. Re-score the optimized resume.
    const optimized: ATSAnalysis = this.ats.analyze(
      { resumeText: rendered.text, prominentText: rendered.prominentText },
      job,
      profile,
    );

    const unverifiedRequirements = original.gaps
      .filter((g) => g.type === "unverified_requirement")
      .map((g) => g.detail);

    if (unverifiedRequirements.length > 0) {
      changes.push(
        `Left ${unverifiedRequirements.length} unverifiable requirement(s) untouched — not invented.`,
      );
    }
    if (optimized.atsScore < targetScore) {
      changes.push(
        `Optimized ATS score is ${optimized.atsScore} (target ${targetScore}). The gap is due to requirements not present in your material, which were not fabricated.`,
      );
    }

    return {
      original,
      optimized,
      changesMade: changes,
      unverifiedRequirements,
      optimizedResumeText: rendered.text,
    };
  }

  /** Public helper so tools can render + persist the optimized resume. */
  buildOptimizedResume(
    master: ParsedResume,
    job: StructuredJob,
    profile?: MasterProfile,
    targetScore = 90,
  ): { result: OptimizationResult; optimized: OptimizedResume } {
    const result = this.optimize(master, job, profile, targetScore);
    // Rebuild the structured optimized resume to hand to document generators.
    const verified = extractKeywordSet(
      master.rawText + " " + (profile?.skills ?? []).join(" "),
    );
    const surfaced = result.original.presentButBuriedKeywords.filter((k) => verified.has(k));
    const optimizedSkills = this.rebuildSkills(master.skills, job, surfaced);
    const jobSkillSet = new Set(
      [...job.requiredSkills, ...job.preferredSkills, ...job.keywords].map(canonicalize),
    );
    const reordered = this.reorderByRelevance(optimizedSkills, jobSkillSet);
    const optimizedExperience = master.experience.map((exp) => ({
      ...exp,
      bullets: this.reorderBullets(exp.bullets, jobSkillSet),
    }));
    const matchedVerifiedSkills = reordered.filter((s) => jobSkillSet.has(canonicalize(s)));
    const summary = this.buildSummary(master.summary, job, matchedVerifiedSkills);
    const resume: ParsedResume = {
      ...master,
      summary,
      skills: reordered,
      experience: optimizedExperience,
    };
    const rendered = this.render(resume);
    resume.rawText = rendered.text;
    return {
      result,
      optimized: { resume, text: rendered.text, prominentText: rendered.prominentText },
    };
  }

  // ---- internals ---------------------------------------------------------
  private prominentText(resume: ParsedResume): string {
    return [resume.summary ?? "", (resume.skills ?? []).join(", ")].join(" ");
  }

  private rebuildSkills(
    existing: string[],
    _job: StructuredJob,
    surfaced: string[],
  ): string[] {
    const out = [...existing];
    const have = new Set(existing.map((s) => canonicalize(s)));
    for (const s of surfaced) {
      if (!have.has(canonicalize(s))) {
        out.push(s);
        have.add(canonicalize(s));
      }
    }
    return out;
  }

  private reorderByRelevance(skills: string[], jobSet: Set<string>): string[] {
    const relevant: string[] = [];
    const rest: string[] = [];
    for (const s of skills) {
      if (jobSet.has(canonicalize(s))) relevant.push(s);
      else rest.push(s);
    }
    return [...relevant, ...rest];
  }

  private reorderBullets(bullets: string[], jobSet: Set<string>): string[] {
    const score = (b: string) => {
      const set = extractKeywordSet(b);
      let s = 0;
      for (const k of set) if (jobSet.has(k)) s++;
      return s;
    };
    // Stable sort by relevance descending; keep original order for ties.
    return bullets
      .map((b, i) => ({ b, i, s: score(b) }))
      .sort((a, z) => z.s - a.s || a.i - z.i)
      .map((x) => x.b);
  }

  private buildSummary(
    existing: string | undefined,
    job: StructuredJob,
    matchedVerifiedSkills: string[],
  ): string | undefined {
    const base = existing?.trim();
    if (matchedVerifiedSkills.length === 0) return base;
    const role = job.title ? ` for ${job.title}` : "";
    const strengths = matchedVerifiedSkills.slice(0, 6).join(", ");
    const line = `Relevant strengths${role}: ${strengths}.`;
    // Never overwrite; append the verified-strengths line.
    return base ? `${base} ${line}` : line;
  }

  private orderChanged(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }

  // ---- rendering ---------------------------------------------------------
  render(resume: ParsedResume): { text: string; prominentText: string } {
    const c = resume.contact;
    const lines: string[] = [];
    if (c.fullName) lines.push(c.fullName);
    const contactBits = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
      .filter(Boolean)
      .join(" | ");
    if (contactBits) lines.push(contactBits);
    lines.push("");

    if (resume.summary) {
      lines.push("SUMMARY", resume.summary, "");
    }
    if (resume.skills.length) {
      lines.push("SKILLS", resume.skills.join(", "), "");
    }
    if (resume.experience.length) {
      lines.push("EXPERIENCE");
      for (const e of resume.experience) {
        const header = [e.title, e.company].filter(Boolean).join(" — ");
        const dates = [e.startDate, e.current ? "Present" : e.endDate]
          .filter(Boolean)
          .join(" - ");
        lines.push([header, dates].filter(Boolean).join("  "));
        for (const b of e.bullets) lines.push(`- ${b}`);
        lines.push("");
      }
    }
    if (resume.education.length) {
      lines.push("EDUCATION");
      for (const ed of resume.education) {
        lines.push(
          [ed.degree, ed.field, ed.institution, ed.endDate].filter(Boolean).join(", "),
        );
      }
      lines.push("");
    }
    if (resume.certifications.length) {
      lines.push("CERTIFICATIONS", resume.certifications.join(", "), "");
    }
    if (resume.languages.length) {
      lines.push("LANGUAGES", resume.languages.join(", "), "");
    }

    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const prominentText = normalizeText(
      [resume.summary ?? "", resume.skills.join(", ")].join(" "),
    );
    return { text, prominentText };
  }
}
