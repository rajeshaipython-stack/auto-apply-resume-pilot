import type { RawJob, StructuredJob, WorkMode } from "../models/index.js";
import { uuid, shortHash } from "../utils/id.js";
import {
  extractJobKeywords,
  parseYearsRequirement,
  splitLines,
  normalizeText,
  isLikelySkill,
} from "../utils/text.js";

/**
 * Extracts a {@link StructuredJob} from a raw job description.
 *
 * Deterministic + source-agnostic: the same extraction runs whether the JD came
 * from manual paste (Phase 1) or a future search adapter (Phase 2+). It never
 * calls the network and never fabricates fields that are not derivable from the
 * text.
 */
export class JobAnalyzer {
  analyze(raw: RawJob): StructuredJob {
    const desc = raw.description;
    const norm = normalizeText(desc);
    const lines = splitLines(desc);

    const requiredSection = this.sliceSection(desc, [
      "requirements", "required", "must have", "qualifications",
      "what you'll need", "what you need", "minimum qualifications",
    ]);
    const preferredSection = this.sliceSection(desc, [
      "preferred", "nice to have", "bonus", "good to have", "plus",
      "preferred qualifications",
    ]);
    const responsibilitiesSection = this.sliceSection(desc, [
      "responsibilities", "what you'll do", "role", "about the role",
      "duties", "day to day", "you will",
    ]);

    const keywords = extractJobKeywords(desc, 40);

    const requiredSkills = this.pickSkills(requiredSection || desc, keywords).slice(0, 20);
    const preferredSkills = preferredSection
      ? this.pickSkills(preferredSection, keywords).filter((k) => !requiredSkills.includes(k)).slice(0, 15)
      : [];

    const minYears = parseYearsRequirement(requiredSection || desc);

    return {
      id: uuid(),
      title: raw.title ?? this.guessTitle(lines),
      company: raw.company ?? this.guessCompany(desc),
      location: raw.location ?? this.guessLocation(desc),
      workMode: this.detectWorkMode(norm),
      requiredSkills,
      preferredSkills,
      experienceRequirement: this.extractExperiencePhrase(requiredSection || desc),
      minYearsExperience: minYears,
      education: this.extractEducation(desc),
      certifications: this.extractCertifications(desc),
      responsibilities: responsibilitiesSection
        ? splitLines(responsibilitiesSection).slice(0, 15)
        : [],
      keywords,
      salary: this.extractSalary(desc),
      visaRequirements: this.extractVisa(norm),
      applicationUrl: raw.url ?? raw.source.url,
      source: raw.source,
      fingerprint: this.fingerprint(raw),
      rawDescription: desc,
      createdAt: new Date().toISOString(),
    };
  }

  /** Stable fingerprint for dedup: company + title + first 400 normalized chars. */
  fingerprint(raw: RawJob): string {
    const basis =
      (raw.company ?? "").toLowerCase().trim() +
      "|" +
      (raw.title ?? "").toLowerCase().trim() +
      "|" +
      normalizeText(raw.description).slice(0, 400);
    return shortHash(basis, 16);
  }

  private detectWorkMode(norm: string): WorkMode {
    if (/\bremote\b/.test(norm) && !/\bhybrid\b/.test(norm)) return "remote";
    if (/\bhybrid\b/.test(norm)) return "hybrid";
    if (/\b(on[-\s]?site|in[-\s]?office|onsite)\b/.test(norm)) return "on-site";
    return "unknown";
  }

  private sliceSection(text: string, headings: string[]): string | undefined {
    const lines = text.split(/\r?\n/);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = (lines[i] ?? "").trim().toLowerCase().replace(/[:\-–—]+$/g, "").trim();
      if (headings.some((h) => l === h || l.startsWith(h + " ") || l === h + ":")) {
        start = i + 1;
        break;
      }
    }
    if (start === -1) return undefined;
    const collected: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const l = (lines[i] ?? "").trim();
      const lower = l.toLowerCase().replace(/[:\-–—]+$/g, "").trim();
      const isNewHeading =
        l.length > 0 &&
        l.length < 40 &&
        /^[A-Za-z ]+:?$/.test(l) &&
        !/^[•\-*]/.test(l) &&
        lower !== "" &&
        ["responsibilities", "requirements", "preferred", "benefits", "about",
         "qualifications", "what we offer", "perks"].some((h) => lower.startsWith(h));
      if (isNewHeading && i > start) break;
      collected.push(l);
    }
    return collected.join("\n").trim() || undefined;
  }

  private pickSkills(section: string, keywords: string[]): string[] {
    // Keep only real skills (curated vocab / phrases / tech-symbol tokens) that
    // appear in this section — so generic words are never treated as required
    // skills (which would produce false "unverifiable requirement" gaps).
    const norm = " " + normalizeText(section) + " ";
    const inSection = keywords.filter((k) => norm.includes(" " + k + " "));
    const skills = inSection.filter((k) => isLikelySkill(k));
    return skills.length > 0 ? skills : keywords.filter((k) => isLikelySkill(k)).slice(0, 12);
  }

  private extractExperiencePhrase(text: string): string | undefined {
    const m = text.match(/[^.\n]*\b\d+\+?\s*(?:-|to)?\s*\d*\s*(?:years?|yrs?)\b[^.\n]*/i);
    return m?.[0]?.trim();
  }

  private extractEducation(text: string): string[] {
    const out = new Set<string>();
    const re = /\b(bachelor'?s?|master'?s?|mba|ph\.?d|b\.?tech|m\.?tech|b\.?sc|m\.?sc|b\.?e|degree)\b[^.\n,]*/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.add(m[0].trim());
    return [...out].slice(0, 5);
  }

  private extractCertifications(text: string): string[] {
    const out = new Set<string>();
    const re = /\b(aws certified|azure|gcp|pmp|scrum master|cissp|ckad|cka|comptia|oracle certified|certified [a-z ]{3,30})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.add(m[0].trim());
    return [...out].slice(0, 8);
  }

  private extractSalary(text: string): string | undefined {
    const m = text.match(
      /(?:[$₹€£]\s?\d[\d,]*(?:\s?[-–to]+\s?[$₹€£]?\s?\d[\d,]*)?(?:\s?(?:per|\/)\s?(?:year|annum|month|hour))?)|(?:\d{2,3}\s?(?:k|lpa|lakhs?)\b)/i,
    );
    return m?.[0]?.trim();
  }

  private extractVisa(norm: string): string | undefined {
    if (/\bvisa sponsorship( is)? (not )?(available|provided|offered)\b/.test(norm)) {
      return norm.includes("not") ? "No visa sponsorship" : "Visa sponsorship available";
    }
    if (/\bwork authorization\b|\bmust be authorized\b|\bwork permit\b/.test(norm)) {
      return "Work authorization required";
    }
    if (/\bsecurity clearance\b/.test(norm)) return "Security clearance required";
    return undefined;
  }

  private guessTitle(lines: string[]): string | undefined {
    return lines[0]?.slice(0, 100).trim() || undefined;
  }

  private guessCompany(text: string): string | undefined {
    const m = text.match(/\bat\s+([A-Z][A-Za-z0-9.&' ]{1,40})\b/);
    return m?.[1]?.trim();
  }

  private guessLocation(text: string): string | undefined {
    const m = text.match(/\b(?:location|based in)\s*[:\-]?\s*([A-Za-z .,]{2,40})/i);
    return m?.[1]?.trim();
  }
}
