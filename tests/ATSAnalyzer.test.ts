import { describe, it, expect } from "vitest";
import { ATSAnalyzer } from "../src/services/ATSAnalyzer.js";
import { JobAnalyzer } from "../src/services/JobAnalyzer.js";
import { ResumeParser } from "../src/services/ResumeParser.js";
import { SAMPLE_RESUME, SAMPLE_JD, SAMPLE_JD_MISSING_SKILL } from "./fixtures.js";

const ats = new ATSAnalyzer();
const parser = new ResumeParser();
const jobAnalyzer = new JobAnalyzer();
const master = parser.parseText(SAMPLE_RESUME);
const raw = (d: string) => ({ description: d, source: { adapter: "manual" } });

describe("ATSAnalyzer", () => {
  it("produces bounded, reproducible scores", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD));
    const a = ats.analyze({ resumeText: master.rawText }, job);
    const b = ats.analyze({ resumeText: master.rawText }, job);
    expect(a.atsScore).toBe(b.atsScore);
    expect(a.atsScore).toBeGreaterThanOrEqual(0);
    expect(a.atsScore).toBeLessThanOrEqual(100);
    expect(a.overallMatchScore).toBeGreaterThan(50);
  });

  it("scores prominent keywords higher than buried ones", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD));
    const buried = ats.analyze({ resumeText: master.rawText, prominentText: "" }, job);
    const prominent = ats.analyze(
      { resumeText: master.rawText, prominentText: "react typescript rest api ci/cd aws" },
      job,
    );
    expect(prominent.breakdown.keywordMatch).toBeGreaterThan(buried.breakdown.keywordMatch);
  });

  it("NEVER counts an unverifiable required skill as present", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD_MISSING_SKILL)); // requires Rust, C++
    const a = ats.analyze({ resumeText: master.rawText }, job);
    // Rust is genuinely absent -> must be flagged, never silently satisfied.
    expect(a.missingKeywords).toContain("rust");
    const unverified = a.gaps.filter((g) => g.type === "unverified_requirement");
    expect(unverified.some((g) => /rust/i.test(g.detail))).toBe(true);
    expect(unverified.every((g) => g.requiresUserInput)).toBe(true);
  });

  it("reports present-but-buried keywords", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD));
    const a = ats.analyze({ resumeText: master.rawText, prominentText: "javascript react" }, job);
    // typescript / ci-cd appear in the body but not the prominent zone.
    expect(a.presentButBuriedKeywords.length).toBeGreaterThan(0);
  });
});
