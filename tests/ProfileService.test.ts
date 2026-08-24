import { describe, it, expect } from "vitest";
import { ProfileService } from "../src/services/ProfileService.js";
import { ResumeParser } from "../src/services/ResumeParser.js";
import { SAMPLE_RESUME } from "./fixtures.js";

const profiles = new ProfileService();
const master = new ResumeParser().parseText(SAMPLE_RESUME);

describe("ProfileService", () => {
  it("seeds a profile from the resume without inventing", () => {
    const p = profiles.fromResume(master);
    expect(p.fullName).toBe("Rajesh Dhamotharan");
    expect(p.email).toBe("rajesh@example.com");
    expect(p.skills.length).toBeGreaterThan(0);
    // Not provided by resume -> must remain empty, not invented.
    expect(p.workAuthorization).toBeUndefined();
    expect(p.preferredRoles).toEqual([]);
  });

  it("reports missing fields and generates questions", () => {
    const p = profiles.fromResume(master);
    const missing = profiles.missingFields(p);
    expect(missing).toContain("workAuthorization");
    expect(missing).toContain("preferredRoles");
    const questions = profiles.missingFieldQuestions(p);
    expect(questions.find((q) => q.field === "workAuthorization")).toBeTruthy();
  });

  it("applies answers, splitting list fields and never asks twice", () => {
    const p = profiles.fromResume(master);
    const updated = profiles.applyAnswers(p, {
      workAuthorization: "Citizen",
      workModePreference: "remote",
      preferredRoles: "Frontend Engineer, Full Stack Developer",
      customQuestion: "Custom answer",
    });
    expect(updated.workAuthorization).toBe("Citizen");
    expect(updated.workModePreference).toBe("remote");
    expect(updated.preferredRoles).toEqual(["Frontend Engineer", "Full Stack Developer"]);
    expect(updated.reusableAnswers.customQuestion).toBe("Custom answer");
    expect(profiles.missingFields(updated)).not.toContain("workAuthorization");
  });

  it("does not overwrite existing values with blanks", () => {
    const p = profiles.fromResume(master);
    const updated = profiles.applyAnswers(p, { fullName: "   " });
    expect(updated.fullName).toBe("Rajesh Dhamotharan");
  });
});
