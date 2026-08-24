import fs from "node:fs";
import { z } from "zod";
import { defineTool } from "./types.js";

/**
 * Master-resume tools: upload + analyze/parse.
 */

export const uploadMasterResume = defineTool({
  name: "upload_master_resume",
  title: "Upload master resume",
  description:
    "Register the user's ONE master resume (PDF, DOCX, TXT, or Markdown). Provide either a local file `path` (preferred — the file is on the user's machine) or raw `text`. The original is stored immutably and never modified.",
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe("Absolute local path to the resume file (PDF/DOCX/TXT/MD)."),
    text: z.string().optional().describe("Raw resume text, if no file is available."),
  }),
  async handler(ctx, args) {
    if (!args.path && !args.text) {
      return { summary: "Provide either `path` or `text`.", isError: true };
    }
    if (args.path) {
      if (!fs.existsSync(args.path)) {
        return { summary: `File not found: ${args.path}`, isError: true };
      }
      const parsed = await ctx.parser.parseFile(args.path);
      ctx.saveMasterResume(parsed, args.path);
      return {
        summary: `Master resume ingested from file (${parsed.sourceFormat.toUpperCase()}). Detected sections: ${parsed.detectedSections.join(", ") || "none"}. Next: run analyze_master_resume.`,
        data: {
          sourceFormat: parsed.sourceFormat,
          detectedSections: parsed.detectedSections,
          name: parsed.contact.fullName,
          email: parsed.contact.email,
          skillsFound: parsed.skills.length,
          experienceEntries: parsed.experience.length,
        },
      };
    }
    const parsed = ctx.parser.parseText(args.text!, "txt");
    ctx.saveMasterResumeText(args.text!, parsed);
    return {
      summary: `Master resume ingested from text. Detected sections: ${parsed.detectedSections.join(", ") || "none"}. Next: run analyze_master_resume.`,
      data: {
        detectedSections: parsed.detectedSections,
        skillsFound: parsed.skills.length,
        experienceEntries: parsed.experience.length,
      },
    };
  },
});

export const analyzeMasterResume = defineTool({
  name: "analyze_master_resume",
  title: "Analyze master resume",
  description:
    "Parse the stored master resume into structured professional information, build a draft Master Profile, and return the list of missing fields ResumePilot should ask the user about. Nothing is invented.",
  inputSchema: z.object({}),
  async handler(ctx) {
    const parsed = ctx.requireMasterResume();
    // Seed the profile only if one doesn't already exist (don't clobber answers).
    let profile = ctx.getProfile();
    if (!profile) {
      profile = ctx.profiles.fromResume(parsed);
      ctx.db.saveProfile(profile);
    }
    const questions = ctx.profiles.missingFieldQuestions(profile);
    return {
      summary:
        questions.length === 0
          ? "Master resume analyzed. Profile looks complete — you can start analyzing jobs."
          : `Master resume analyzed. I still need ${questions.length} piece(s) of information. Ask the user these, then call setup_user_profile.`,
      data: {
        extracted: {
          name: parsed.contact.fullName,
          email: parsed.contact.email,
          phone: parsed.contact.phone,
          location: parsed.contact.location,
          skills: parsed.skills,
          experienceEntries: parsed.experience.length,
          education: parsed.education.map((e) => e.degree),
          certifications: parsed.certifications,
        },
        missingQuestions: questions,
      },
    };
  },
});

export const resumeTools = [uploadMasterResume, analyzeMasterResume];
