import { describe, it, expect } from "vitest";
import { JobAnalyzer } from "../src/services/JobAnalyzer.js";
import { SAMPLE_JD } from "./fixtures.js";

const analyzer = new JobAnalyzer();
const raw = (description: string) => ({ description, source: { adapter: "manual" } });

describe("JobAnalyzer", () => {
  it("extracts required skills as real skills only (no generic words / numbers)", () => {
    const job = analyzer.analyze(raw(SAMPLE_JD));
    expect(job.requiredSkills).toEqual(expect.arrayContaining(["react", "typescript"]));
    expect(job.requiredSkills).not.toContain("5+");
    expect(job.requiredSkills).not.toContain("development");
    expect(job.requiredSkills).not.toContain("modern");
  });

  it("separates preferred skills", () => {
    const job = analyzer.analyze(raw(SAMPLE_JD));
    expect(job.preferredSkills).toEqual(expect.arrayContaining(["graphql", "kubernetes"]));
  });

  it("detects work mode and minimum years", () => {
    const job = analyzer.analyze(raw(SAMPLE_JD));
    expect(job.workMode).toBe("hybrid");
    expect(job.minYearsExperience).toBe(5);
  });

  it("produces a stable fingerprint for dedup", () => {
    const a = analyzer.fingerprint(raw(SAMPLE_JD));
    const b = analyzer.fingerprint(raw(SAMPLE_JD));
    expect(a).toBe(b);
    const c = analyzer.fingerprint(raw("totally different description text here for a job"));
    expect(a).not.toBe(c);
  });
});
