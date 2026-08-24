import type {
  StructuredJob,
  MasterProfile,
  ATSAnalysis,
  KeywordMatch,
  Gap,
  ScoreBreakdown,
} from "../models/index.js";
import {
  extractKeywordSet,
  canonicalize,
  splitLines,
  isWeakBullet,
  isLikelySkill,
  hasMeasurableAchievement,
} from "../utils/text.js";
import { shortHash } from "../utils/id.js";

export interface ResumeView {
  /** Full resume text — the ATS "ground truth". */
  resumeText: string;
  /**
   * Text that appears in high-signal zones (skills section + summary). Keywords
   * present here are considered "prominent". Optional; falls back to resumeText.
   */
  prominentText?: string;
}

/**
 * Deterministic ATS + match analyzer.
 *
 * Scores are reproducible functions of (resume text, structured job, profile),
 * which makes them unit-testable and makes "original vs optimized" comparisons
 * meaningful. Crucially, a required skill that is NOT verifiable from the user's
 * own resume/profile is reported as a gap requiring user input — it is never
 * silently counted as present.
 */
export class ATSAnalyzer {
  private static readonly WEIGHTS = {
    ats: { keyword: 0.5, skill: 0.3, qualification: 0.1, formatting: 0.1 },
    match: {
      skill: 0.35,
      keyword: 0.25,
      experience: 0.2,
      qualification: 0.1,
      location: 0.1,
    },
  };

  analyze(
    resume: ResumeView,
    job: StructuredJob,
    profile?: MasterProfile,
  ): ATSAnalysis {
    const verified = this.buildVerifiedSet(resume.resumeText, profile);
    const prominent = extractKeywordSet(resume.prominentText ?? resume.resumeText);

    // ----- keyword matches (focused on skill-like terms) -----------------
    // ATS parsers weigh role-relevant skills/keywords, not every English word.
    // Scoring over a focused set keeps scores meaningful and makes surfacing
    // buried skills a real, measurable improvement.
    const jobKeywords = this.dedupe(
      [
        ...job.requiredSkills.map(canonicalize),
        ...job.preferredSkills.map(canonicalize),
        ...job.keywords.map(canonicalize).filter((k) => isLikelySkill(k)),
      ].filter((k) => k.length > 0),
    );

    const keywordMatches: KeywordMatch[] = jobKeywords.map((k) => {
      const present = verified.has(k);
      const isProminent = prominent.has(k);
      return {
        keyword: k,
        present,
        prominence: present ? (isProminent ? 1 : 0.5) : 0,
        foundIn: present ? (isProminent ? ["skills/summary"] : ["body"]) : [],
      };
    });

    const missingKeywords = keywordMatches.filter((m) => !m.present).map((m) => m.keyword);
    const presentButBuriedKeywords = keywordMatches
      .filter((m) => m.present && m.prominence < 1)
      .map((m) => m.keyword);

    // ----- component scores ----------------------------------------------
    const keywordMatch = this.avg(keywordMatches.map((m) => m.prominence)) * 100;

    const requiredSkills = this.dedupe(job.requiredSkills.map(canonicalize));
    const presentRequired = requiredSkills.filter((s) => verified.has(s));
    const skillMatch =
      requiredSkills.length === 0 ? 100 : (presentRequired.length / requiredSkills.length) * 100;

    const experienceMatch = this.scoreExperience(job, profile, resume.resumeText);
    const qualificationMatch = this.scoreQualifications(job, verified, resume.resumeText);
    const locationMatch = this.scoreLocation(job, profile);
    const formatting = this.scoreFormatting(resume.resumeText);

    const breakdown: ScoreBreakdown = {
      skillMatch: this.round(skillMatch),
      keywordMatch: this.round(keywordMatch),
      experienceMatch: this.round(experienceMatch),
      qualificationMatch: this.round(qualificationMatch),
      locationMatch: this.round(locationMatch),
    };

    const w = ATSAnalyzer.WEIGHTS;
    const atsScore = this.round(
      w.ats.keyword * keywordMatch +
        w.ats.skill * skillMatch +
        w.ats.qualification * qualificationMatch +
        w.ats.formatting * formatting,
    );
    const overallMatchScore = this.round(
      w.match.skill * skillMatch +
        w.match.keyword * keywordMatch +
        w.match.experience * experienceMatch +
        w.match.qualification * qualificationMatch +
        w.match.location * locationMatch,
    );

    const gaps = this.buildGaps(
      job,
      verified,
      keywordMatches,
      resume.resumeText,
      qualificationMatch,
      formatting,
    );

    return {
      overallMatchScore,
      atsScore,
      breakdown,
      keywordMatches,
      missingKeywords,
      presentButBuriedKeywords,
      gaps,
      recommendations: this.buildRecommendations(gaps, presentButBuriedKeywords),
      resumeTextHash: shortHash(resume.resumeText, 16),
      analyzedAt: new Date().toISOString(),
    };
  }

  // ---- verification ------------------------------------------------------
  /** Everything the user can genuinely claim: resume text + profile fields. */
  private buildVerifiedSet(resumeText: string, profile?: MasterProfile): Set<string> {
    let corpus = resumeText;
    if (profile) {
      corpus +=
        " " +
        [
          ...(profile.skills ?? []),
          ...(profile.certifications ?? []),
          ...(profile.languages ?? []),
          profile.summary ?? "",
          ...(profile.experience ?? []).flatMap((e) => [
            e.title ?? "",
            e.summary ?? "",
            ...(e.bullets ?? []),
          ]),
        ].join(" ");
    }
    return extractKeywordSet(corpus);
  }

  // ---- component scorers -------------------------------------------------
  private scoreExperience(
    job: StructuredJob,
    profile: MasterProfile | undefined,
    resumeText: string,
  ): number {
    if (job.minYearsExperience === undefined) return 100;
    const years = profile?.totalYearsExperience ?? this.estimateYears(resumeText);
    if (years === undefined) return 65; // unknown — neutral
    if (years >= job.minYearsExperience) return 100;
    return Math.max(30, (years / job.minYearsExperience) * 100);
  }

  /** Estimate total years from the earliest 4-digit year found to now. */
  private estimateYears(resumeText: string): number | undefined {
    const years = (resumeText.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
    if (years.length === 0) return undefined;
    const earliest = Math.min(...years);
    const now = new Date().getFullYear();
    const span = now - earliest;
    if (span < 0 || span > 60) return undefined;
    return span;
  }

  private scoreQualifications(
    job: StructuredJob,
    verified: Set<string>,
    resumeText: string,
  ): number {
    const parts: number[] = [];
    const norm = resumeText.toLowerCase();

    if (job.education.length > 0) {
      const hasDegree =
        /\b(bachelor|master|mba|ph\.?d|b\.?tech|m\.?tech|b\.?sc|m\.?sc|b\.?e|degree|bca|mca)\b/i.test(
          norm,
        );
      parts.push(hasDegree ? 100 : 40);
    }
    if (job.certifications.length > 0) {
      const matched = job.certifications.filter((c) =>
        verified.has(canonicalize(c.split(" ")[0] ?? c)),
      ).length;
      parts.push((matched / job.certifications.length) * 100);
    }
    if (parts.length === 0) return 100;
    return this.avg(parts);
  }

  private scoreLocation(job: StructuredJob, profile?: MasterProfile): number {
    if (job.workMode === "remote") return 100;
    if (!profile) return 70;
    if (
      profile.workModePreference !== "unknown" &&
      profile.workModePreference === job.workMode
    ) {
      return 100;
    }
    if (job.location && profile.preferredLocations.length > 0) {
      const loc = job.location.toLowerCase();
      if (profile.preferredLocations.some((p) => loc.includes(p.toLowerCase()))) return 100;
    }
    if (profile.relocationPreference) return 90;
    if (!job.location) return 75;
    return 50;
  }

  private scoreFormatting(resumeText: string): number {
    let score = 100;
    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(resumeText);
    if (!hasEmail) score -= 20;
    const lower = resumeText.toLowerCase();
    const hasExperience = /experience|employment|work history/.test(lower);
    const hasEducation = /education|qualification/.test(lower);
    const hasSkills = /skills|technologies|competenc/.test(lower);
    if (!hasExperience) score -= 15;
    if (!hasEducation) score -= 10;
    if (!hasSkills) score -= 15;
    const words = resumeText.split(/\s+/).filter(Boolean).length;
    if (words < 120) score -= 20; // too sparse
    if (words > 1400) score -= 10; // likely too long / dense
    return Math.max(0, score);
  }

  // ---- gaps + recommendations -------------------------------------------
  private buildGaps(
    job: StructuredJob,
    verified: Set<string>,
    keywordMatches: KeywordMatch[],
    resumeText: string,
    qualificationMatch: number,
    formatting: number,
  ): Gap[] {
    const gaps: Gap[] = [];

    // Required skills that cannot be verified -> NEVER invented.
    for (const skill of this.dedupe(job.requiredSkills.map(canonicalize))) {
      if (!verified.has(skill)) {
        gaps.push({
          type: "unverified_requirement",
          detail: `Required skill "${skill}" is not verifiable from your resume or profile.`,
          recommendation: `Cannot verify "${skill}" from your existing material. If you genuinely have it, add it to your profile/resume yourself — ResumePilot will not invent it.`,
          requiresUserInput: true,
        });
      }
    }

    // Present but buried keywords -> can be surfaced (legitimate optimization).
    for (const m of keywordMatches.filter((k) => k.present && k.prominence < 1)) {
      gaps.push({
        type: "buried_experience",
        detail: `"${m.keyword}" appears in your history but not prominently.`,
        recommendation: `Surface "${m.keyword}" in your Skills section or summary — it is already supported by your experience.`,
        requiresUserInput: false,
      });
    }

    // Weak / non-measurable bullets.
    const bullets = splitLines(resumeText).filter((l) => l.length > 15 && /[a-z]/.test(l));
    let weak = 0;
    let nonMeasurable = 0;
    for (const b of bullets) {
      if (isWeakBullet(b)) weak++;
      else if (!hasMeasurableAchievement(b)) nonMeasurable++;
    }
    if (weak > 0) {
      gaps.push({
        type: "weak_bullet",
        detail: `${weak} bullet(s) start with weak phrasing (e.g. "responsible for").`,
        recommendation:
          "Rewrite weak bullets to lead with strong action verbs — using only what you actually did.",
        requiresUserInput: false,
      });
    }
    if (nonMeasurable > Math.max(3, bullets.length / 2)) {
      gaps.push({
        type: "missing_measurable_achievement",
        detail: "Most bullets lack measurable outcomes (numbers, %, scale).",
        recommendation:
          "Add real metrics you achieved (e.g. improved X by Y%). Never fabricate numbers.",
        requiresUserInput: true,
      });
    }

    // Qualification gaps.
    if (job.education.length > 0 && qualificationMatch < 60) {
      gaps.push({
        type: "missing_qualification",
        detail: `Job lists education requirements: ${job.education.join("; ")}.`,
        recommendation:
          "Ensure your education section clearly lists your degree; if you lack the required degree this cannot be added.",
        requiresUserInput: true,
      });
    }

    // Formatting risk.
    if (formatting < 80) {
      gaps.push({
        type: "formatting_risk",
        detail: "Resume may be hard for ATS parsers (missing standard sections or contact info).",
        recommendation:
          "Use clear standard section headings (Experience, Education, Skills) and include contact details.",
        requiresUserInput: false,
      });
    }

    return gaps;
  }

  private buildRecommendations(gaps: Gap[], buried: string[]): string[] {
    const recs: string[] = [];
    if (buried.length > 0) {
      recs.push(
        `Surface these already-supported keywords into your Skills/Summary: ${buried
          .slice(0, 12)
          .join(", ")}.`,
      );
    }
    const unverified = gaps.filter((g) => g.type === "unverified_requirement");
    if (unverified.length > 0) {
      recs.push(
        `${unverified.length} required item(s) could not be verified from your material and will NOT be invented.`,
      );
    }
    for (const g of gaps) {
      if (g.type !== "unverified_requirement" && g.type !== "buried_experience") {
        recs.push(g.recommendation);
      }
    }
    return this.dedupe(recs);
  }

  // ---- helpers -----------------------------------------------------------
  private avg(xs: number[]): number {
    if (xs.length === 0) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  private round(x: number): number {
    return Math.max(0, Math.min(100, Math.round(x)));
  }
  private dedupe<T>(xs: T[]): T[] {
    return [...new Set(xs)];
  }
}
