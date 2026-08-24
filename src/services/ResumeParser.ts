import fs from "node:fs";
import path from "node:path";
import type { ParsedResume, ContactInfo, ExperienceItem, EducationItem } from "../models/index.js";
import { splitLines } from "../utils/text.js";

/**
 * Parses a master resume (PDF / DOCX / TXT / Markdown) into a structured
 * {@link ParsedResume}.
 *
 * Design principle: be conservative. We extract what is clearly present and
 * leave the rest empty. We NEVER fabricate a field. The `rawText` is preserved
 * verbatim and is treated everywhere else as the ground-truth for verifying
 * whether a job requirement is genuinely supported by the user's own history.
 *
 * Text extraction dependencies (`pdf-parse`, `mammoth`) are imported lazily so
 * that unit tests can exercise the section-parsing logic on plain text without
 * needing the native/binary parsers.
 */

const SECTION_HEADINGS: Record<string, string[]> = {
  summary: ["summary", "professional summary", "profile", "objective", "about"],
  experience: [
    "experience", "work experience", "professional experience",
    "employment", "employment history", "work history", "career history",
  ],
  education: ["education", "academic background", "academics", "qualifications"],
  skills: ["skills", "technical skills", "core competencies", "technologies", "tech stack"],
  projects: ["projects", "personal projects", "key projects", "selected projects"],
  certifications: ["certifications", "certificates", "licenses", "licenses & certifications"],
  languages: ["languages", "language proficiency"],
};

export class ResumeParser {
  /** Detect format and extract raw text from a file path. */
  async extractText(
    filePath: string,
  ): Promise<{ text: string; format: ParsedResume["sourceFormat"] }> {
    const ext = path.extname(filePath).toLowerCase();
    const buf = fs.readFileSync(filePath);
    if (ext === ".pdf") {
      const mod: any = await import("pdf-parse");
      const pdfParse = mod.default ?? mod;
      const data = await pdfParse(buf);
      return { text: data.text ?? "", format: "pdf" };
    }
    if (ext === ".docx") {
      const mammoth: any = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: buf });
      return { text: res.value ?? "", format: "docx" };
    }
    if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
      return { text: buf.toString("utf8"), format: "txt" };
    }
    // Best-effort: treat unknown as utf8 text.
    return { text: buf.toString("utf8"), format: "unknown" };
  }

  async parseFile(filePath: string): Promise<ParsedResume> {
    const { text, format } = await this.extractText(filePath);
    return this.parseText(text, format);
  }

  /** Parse already-extracted plain text. Pure + fully unit-testable. */
  parseText(
    rawText: string,
    sourceFormat: ParsedResume["sourceFormat"] = "txt",
  ): ParsedResume {
    const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\t/g, " ").trimEnd());
    const sections = this.splitSections(lines);

    const contact = this.extractContact(rawText, lines);
    const skills = this.extractSkills(sections.skills ?? []);
    const experience = this.extractExperience(sections.experience ?? []);
    const education = this.extractEducation(sections.education ?? []);
    const certifications = this.extractListItems(sections.certifications ?? []);
    const languages = this.extractListItems(sections.languages ?? []);
    const summary = (sections.summary ?? []).join(" ").trim() || undefined;
    const projects = this.extractProjects(sections.projects ?? []);

    return {
      contact,
      summary,
      skills,
      experience,
      education,
      projects,
      certifications,
      languages,
      rawText,
      detectedSections: Object.keys(sections),
      sourceFormat,
    };
  }

  // ---- section splitting -------------------------------------------------
  private matchHeading(line: string): string | undefined {
    const l = line.trim().toLowerCase().replace(/[:\-–—]+$/g, "").trim();
    if (l.length === 0 || l.length > 40) return undefined;
    for (const [key, variants] of Object.entries(SECTION_HEADINGS)) {
      if (variants.includes(l)) return key;
    }
    return undefined;
  }

  private splitSections(lines: string[]): Record<string, string[]> {
    const sections: Record<string, string[]> = {};
    let current: string | undefined;
    for (const line of lines) {
      const heading = this.matchHeading(line);
      if (heading) {
        current = heading;
        sections[current] = sections[current] ?? [];
        continue;
      }
      if (current) {
        (sections[current] as string[]).push(line);
      }
    }
    return sections;
  }

  // ---- contact -----------------------------------------------------------
  private extractContact(rawText: string, lines: string[]): ContactInfo {
    const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const phone = rawText.match(
      /(\+?\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/,
    )?.[0]?.trim();
    const linkedin = rawText.match(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s)]+/i)?.[0];
    const github = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)]+/i)?.[0];
    const genericUrl = rawText.match(/https?:\/\/[^\s)]+/gi) ?? [];
    const portfolio = genericUrl.find(
      (u) => !/linkedin\.com|github\.com/i.test(u),
    );

    // Full name heuristic: first non-empty line that isn't contact info.
    let fullName: string | undefined;
    for (const line of lines.slice(0, 6)) {
      const l = line.trim();
      if (!l) continue;
      if (/@|https?:|\d{3}/.test(l)) continue;
      if (l.split(/\s+/).length <= 5 && /^[A-Za-z.,'\-\s]+$/.test(l)) {
        fullName = l.replace(/\s{2,}/g, " ");
        break;
      }
    }

    // Location heuristic: a "City, Region" segment in the top lines. Handles
    // pipe-delimited contact lines (e.g. "email | phone | Chennai, India | ...").
    let location: string | undefined;
    for (const line of lines.slice(0, 8)) {
      for (const seg of line.split("|")) {
        const s = seg.trim();
        if (/@|https?:|\d/.test(s)) continue;
        if (/^[A-Za-z .]+,\s*[A-Za-z .]{2,}$/.test(s)) {
          location = s;
          break;
        }
      }
      if (location) break;
    }

    return {
      fullName,
      email,
      phone,
      location,
      linkedin: linkedin ? this.ensureProtocol(linkedin) : undefined,
      github: github ? this.ensureProtocol(github) : undefined,
      portfolio,
      websites: genericUrl,
    };
  }

  private ensureProtocol(u: string): string {
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
  }

  // ---- skills ------------------------------------------------------------
  private extractSkills(lines: string[]): string[] {
    const joined = lines.join("\n");
    const tokens = joined
      .split(/[\n,;•·|\/]|(?:\s-\s)/)
      .map((s) => s.replace(/^[•\-*·\s]+/, "").trim())
      .filter((s) => s.length > 1 && s.length <= 40)
      // drop obvious label prefixes like "Languages:"
      .map((s) => s.replace(/^[A-Za-z ]+:\s*/, "").trim())
      .filter((s) => s.length > 1);
    return this.dedupePreserveOrder(tokens);
  }

  private extractListItems(lines: string[]): string[] {
    const items = lines
      .map((l) => l.replace(/^[•\-*·\s]+/, "").trim())
      .filter((l) => l.length > 1);
    return this.dedupePreserveOrder(items);
  }

  // ---- experience --------------------------------------------------------
  private extractExperience(lines: string[]): ExperienceItem[] {
    const items: ExperienceItem[] = [];
    let current: ExperienceItem | undefined;

    const flush = () => {
      if (current && (current.raw?.trim() || current.bullets.length)) {
        items.push(current);
      }
      current = undefined;
    };

    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      const isBullet = /^[•\-*·]/.test(l);
      const looksLikeHeader =
        !isBullet &&
        (/\b(20\d{2}|19\d{2})\b/.test(l) ||
          /\b(present|current)\b/i.test(l) ||
          /\b(at|@)\b/i.test(l) ||
          /,\s*[A-Z]/.test(l)) &&
        l.length < 120;

      if (looksLikeHeader) {
        flush();
        const { title, company } = this.splitTitleCompany(l);
        current = {
          title,
          company,
          current: /\b(present|current)\b/i.test(l),
          bullets: [],
          raw: l,
        };
      } else if (isBullet) {
        if (!current) current = { current: false, bullets: [], raw: "" };
        current.bullets.push(l.replace(/^[•\-*·]\s*/, "").trim());
        current.raw = ((current.raw ?? "") + "\n" + l).trim();
      } else {
        // Continuation / description line.
        if (!current) current = { current: false, bullets: [], raw: "" };
        current.raw = ((current.raw ?? "") + "\n" + l).trim();
      }
    }
    flush();
    return items;
  }

  private splitTitleCompany(line: string): { title?: string; company?: string } {
    // Common patterns: "Title at Company", "Title — Company", "Title, Company"
    const atMatch = line.match(/^(.*?)\s+(?:at|@)\s+(.*?)(?:\s*[|,–—-].*)?$/i);
    if (atMatch) return { title: atMatch[1]?.trim(), company: atMatch[2]?.trim() };
    const sepMatch = line.match(/^(.*?)\s*[|–—]\s*(.*?)(?:\s*[,|].*)?$/);
    if (sepMatch) return { title: sepMatch[1]?.trim(), company: sepMatch[2]?.trim() };
    return { title: line.replace(/\s*\d.*$/, "").trim() || undefined };
  }

  // ---- education ---------------------------------------------------------
  private extractEducation(lines: string[]): EducationItem[] {
    const blocks = splitLines(lines.join("\n"));
    const items: EducationItem[] = [];
    for (const b of blocks) {
      if (b.length < 3) continue;
      const degreeMatch = b.match(
        /\b(b\.?tech|m\.?tech|b\.?sc|m\.?sc|b\.?e|m\.?e|bachelor|master|mba|ph\.?d|diploma|b\.?a|m\.?a|bca|mca)\b[^,\n]*/i,
      );
      const yearMatch = b.match(/\b(19|20)\d{2}\b/g);
      items.push({
        degree: degreeMatch?.[0]?.trim(),
        institution: this.guessInstitution(b),
        endDate: yearMatch ? yearMatch[yearMatch.length - 1] : undefined,
        raw: b,
      });
    }
    return items;
  }

  private guessInstitution(text: string): string | undefined {
    const m = text.match(
      /\b([A-Z][A-Za-z.&' ]*(?:University|Institute|College|School|Polytechnic)[A-Za-z.&' ]*)\b/,
    );
    return m?.[1]?.trim();
  }

  private extractProjects(lines: string[]) {
    const blocks = splitLines(lines.join("\n"));
    return blocks
      .filter((b) => b.length > 3)
      .map((b) => ({
        name: b.split(/[:–—-]/)[0]?.trim().slice(0, 80),
        description: b,
        bullets: [] as string[],
        technologies: [] as string[],
        raw: b,
      }));
  }

  private dedupePreserveOrder(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of items) {
      const key = i.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i);
    }
    return out;
  }
}
