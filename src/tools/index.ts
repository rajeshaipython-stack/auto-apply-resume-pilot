import type { ToolDef } from "./types.js";
import { resumeTools } from "./resume.js";
import { profileTools } from "./profile.js";
import { jobTools } from "./jobs.js";
import { atsTools } from "./ats.js";
import { applicationTools } from "./applications.js";
import { trackingTools } from "./tracking.js";
import { reportTools } from "./reports.js";

/** All ResumePilot MCP tools, in a sensible workflow order. */
export const allTools: ToolDef[] = [
  ...resumeTools,
  ...profileTools,
  ...jobTools,
  ...atsTools,
  ...applicationTools,
  ...trackingTools,
  ...reportTools,
];

export {
  resumeTools,
  profileTools,
  jobTools,
  atsTools,
  applicationTools,
  trackingTools,
  reportTools,
};
