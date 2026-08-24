import { describe, it, expect } from "vitest";
import { ResumeOptimizer } from "../src/services/ResumeOptimizer.js";
import { JobAnalyzer } from "../src/services/JobAnalyzer.js";
import { ResumeParser } from "../src/services/ResumeParser.js";
import { extractKeywordSet } from "../src/utils/text.js";
import { SAMPLE_RESUME, SAMPLE_JD, SAMPLE_JD_MISSING_SKILL } from "./fixtures.js";

const optimizer = new ResumeOptimizer();
const parser = new ResumeParser();
const jobAnalyzer = new JobAnalyzer();
const master = parser.parseText(SAMPLE_RESUME);
const raw = (d: string) => ({ description: d, source: { adapter: "manual" } });

describe("ResumeOptimizer", () => {
  it("optimized ATS score is >= original (surfacing verified content)", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD));
    const res = optimizer.optimize(master, job);
    expect(res.optimized.atsScore).toBeGreaterThanOrEqual(res.original.atsScore);
    expect(res.changesMade.length).toBeGreaterThan(0);
  });

  it("NEVER invents a skill the user does not have", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD_MISSING_SKILL)); // Rust, C++
    const { result, optimized } = optimizer.buildOptimizedResume(master, job);
    const kw = extractKeywordSet(optimized.text);
    expect(kw.has("rust")).toBe(false);
    expect(kw.has("c++")).toBe(false);
    expect(result.unverifiedRequirements.length).toBeGreaterThan(0);
    expect(result.unverifiedRequirements.join(" ").toLowerCase()).toContain("rust");
  });

  it("does not modify the master resume object", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD));
    const before = JSON.stringify(master);
    optimizer.optimize(master, job);
    expect(JSON.stringify(master)).toBe(before);
  });

  it("keeps only verified skills in the optimized skills list", () => {
    const job = jobAnalyzer.analyze(raw(SAMPLE_JD));
    const { optimized } = optimizer.buildOptimizedResume(master, job);
    const masterSkillSet = extractKeywordSet(
      master.rawText,
    );
    // Every surfaced skill must be traceable to the master resume text.
    for (const s of optimized.resume.skills) {
      const canon = extractKeywordSet(s);
      const supported = [...canon].every((c) => masterSkillSet.has(c) || c.length <= 2);
      expect(supported).toBe(true);
    }
  });
});
