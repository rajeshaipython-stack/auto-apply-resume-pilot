import { describe, it, expect } from "vitest";
import { ResumePilotDB } from "../src/database/database.js";
import type { StructuredJob } from "../src/models/index.js";

function sampleJob(id: string, fp: string): StructuredJob {
  return {
    id,
    title: "Engineer",
    company: "Acme",
    requiredSkills: ["react"],
    preferredSkills: [],
    education: [],
    certifications: [],
    responsibilities: [],
    keywords: ["react"],
    workMode: "remote",
    source: { adapter: "manual" },
    fingerprint: fp,
    rawDescription: "desc",
    createdAt: new Date().toISOString(),
  };
}

describe("ResumePilotDB", () => {
  it("allocates sequential application numbers atomically", () => {
    const db = new ResumePilotDB(":memory:");
    expect(db.nextApplicationNumber()).toBe(1);
    expect(db.nextApplicationNumber()).toBe(2);
    expect(db.nextApplicationNumber()).toBe(3);
    db.close();
  });

  it("saves and dedups jobs by fingerprint", () => {
    const db = new ResumePilotDB(":memory:");
    db.saveJob(sampleJob("j1", "fp-1"));
    db.saveJob(sampleJob("j2", "fp-2"));
    expect(db.findJobByFingerprint("fp-1")?.id).toBe("j1");
    expect(db.listJobs().length).toBe(2);
    db.close();
  });

  it("round-trips a profile", () => {
    const db = new ResumePilotDB(":memory:");
    db.saveProfile({
      fullName: "Test User",
      skills: ["react"],
      education: [],
      experience: [],
      certifications: [],
      languages: [],
      preferredRoles: [],
      preferredLocations: [],
      workModePreference: "remote",
      reusableAnswers: {},
    });
    expect(db.getProfile()?.fullName).toBe("Test User");
    db.close();
  });
});
