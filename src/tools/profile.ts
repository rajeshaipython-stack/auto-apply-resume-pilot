import { z } from "zod";
import { defineTool } from "./types.js";

/**
 * Profile tools: setup (answer missing questions), get, update.
 */

export const setupUserProfile = defineTool({
  name: "setup_user_profile",
  title: "Set up user profile",
  description:
    "Apply the user's answers to the missing-information questionnaire, merging them into the Master Profile. Pass an `answers` object keyed by field name (e.g. { fullName, email, phone, location, workAuthorization, workModePreference, noticePeriod, salaryExpectation, preferredRoles }). Only fills provided fields; never overwrites with blanks; never asks twice.",
  inputSchema: z.object({
    answers: z
      .record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean(), z.number()]))
      .describe("Map of profile field -> answer. Comma-separated strings are accepted for list fields."),
  }),
  async handler(ctx, args) {
    const profile = ctx.requireProfile();
    const updated = ctx.profiles.applyAnswers(profile, args.answers);
    ctx.db.saveProfile(updated);
    const remaining = ctx.profiles.missingFieldQuestions(updated);
    return {
      summary:
        remaining.length === 0
          ? "Profile complete. Ready to analyze jobs."
          : `Saved. Still missing ${remaining.length} field(s).`,
      data: { remainingQuestions: remaining, profile: updated },
    };
  },
});

export const getUserProfile = defineTool({
  name: "get_user_profile",
  title: "Get user profile",
  description: "Return the current Master Profile and any still-missing fields.",
  inputSchema: z.object({}),
  async handler(ctx) {
    const profile = ctx.getProfile();
    if (!profile) {
      return {
        summary: "No profile yet. Run analyze_master_resume first.",
        isError: true,
      };
    }
    return {
      summary: "Current Master Profile.",
      data: {
        profile,
        missingQuestions: ctx.profiles.missingFieldQuestions(profile),
      },
    };
  },
});

export const updateUserProfile = defineTool({
  name: "update_user_profile",
  title: "Update user profile",
  description:
    "Update specific Master Profile fields with an `updates` object. Same merge semantics as setup_user_profile. Use for corrections or adding preferences (e.g. preferredLocations, relocationPreference, reusable application answers).",
  inputSchema: z.object({
    updates: z
      .record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean(), z.number()]))
      .describe("Map of field -> new value."),
  }),
  async handler(ctx, args) {
    const profile = ctx.requireProfile();
    const updated = ctx.profiles.applyAnswers(profile, args.updates);
    ctx.db.saveProfile(updated);
    return { summary: "Profile updated.", data: { profile: updated } };
  },
});

export const profileTools = [setupUserProfile, getUserProfile, updateUserProfile];
