import { describe, it, expect } from "vitest";
import {
  tokenize,
  canonicalize,
  isLikelySkill,
  extractKeywordSet,
  extractJobKeywords,
  parseYearsRequirement,
  jaccard,
  hasMeasurableAchievement,
  isWeakBullet,
} from "../src/utils/text.js";

describe("text utils", () => {
  it("canonicalizes common surface forms", () => {
    expect(canonicalize("JS")).toBe("javascript");
    expect(canonicalize("Node.js")).toBe("node");
    expect(canonicalize("reactjs")).toBe("react");
    expect(canonicalize("k8s")).toBe("kubernetes");
  });

  it("tokenizes and drops stopwords", () => {
    const toks = tokenize("Experience with React and strong REST APIs");
    expect(toks).toContain("react");
    expect(toks).not.toContain("with");
    expect(toks).not.toContain("strong");
  });

  it("identifies real skills but rejects generic words and numeric fragments", () => {
    expect(isLikelySkill("react")).toBe(true);
    expect(isLikelySkill("c++")).toBe(true);
    expect(isLikelySkill("ci/cd")).toBe(true);
    expect(isLikelySkill("development")).toBe(false);
    expect(isLikelySkill("modern")).toBe(false);
    expect(isLikelySkill("5+")).toBe(false);
    expect(isLikelySkill("3.5")).toBe(false);
  });

  it("extracts multi-word phrases and single tokens", () => {
    const set = extractKeywordSet("We use REST API and machine learning daily");
    expect(set.has("rest api")).toBe(true);
    expect(set.has("machine learning")).toBe(true);
  });

  it("ranks job keywords with phrases boosted", () => {
    const kws = extractJobKeywords("React React TypeScript rest api rest api rest api");
    expect(kws[0]).toBe("rest api");
  });

  it("parses years requirement", () => {
    expect(parseYearsRequirement("5+ years of experience")).toBe(5);
    expect(parseYearsRequirement("minimum 3-5 years")).toBe(3);
    expect(parseYearsRequirement("no numbers here")).toBeUndefined();
  });

  it("computes jaccard similarity", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("detects measurable achievements and weak bullets", () => {
    expect(hasMeasurableAchievement("Improved performance by 30%")).toBe(true);
    expect(hasMeasurableAchievement("Worked on some features")).toBe(false);
    expect(isWeakBullet("Responsible for the frontend")).toBe(true);
    expect(isWeakBullet("Built React apps for 40000 users")).toBe(false);
  });
});
