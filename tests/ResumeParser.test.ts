import { describe, it, expect } from "vitest";
import { ResumeParser } from "../src/services/ResumeParser.js";
import { SAMPLE_RESUME } from "./fixtures.js";

describe("ResumeParser", () => {
  const parser = new ResumeParser();

  it("extracts contact information", () => {
    const r = parser.parseText(SAMPLE_RESUME);
    expect(r.contact.fullName).toBe("Rajesh Dhamotharan");
    expect(r.contact.email).toBe("rajesh@example.com");
    expect(r.contact.location).toContain("Chennai");
    expect(r.contact.linkedin).toContain("linkedin.com");
    expect(r.contact.github).toContain("github.com");
  });

  it("detects standard sections", () => {
    const r = parser.parseText(SAMPLE_RESUME);
    expect(r.detectedSections).toEqual(
      expect.arrayContaining(["summary", "skills", "experience", "education", "certifications"]),
    );
  });

  it("parses skills, experience, education, certifications", () => {
    const r = parser.parseText(SAMPLE_RESUME);
    expect(r.skills.map((s) => s.toLowerCase())).toEqual(
      expect.arrayContaining(["react", "python", "aws"]),
    );
    expect(r.experience.length).toBeGreaterThanOrEqual(2);
    expect(r.experience[0]!.bullets.length).toBeGreaterThan(0);
    expect(r.education.length).toBeGreaterThanOrEqual(1);
    expect(r.certifications.join(" ")).toContain("AWS");
  });

  it("preserves raw text as ground truth", () => {
    const r = parser.parseText(SAMPLE_RESUME);
    expect(r.rawText).toBe(SAMPLE_RESUME);
  });
});
