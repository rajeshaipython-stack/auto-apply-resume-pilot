import type { RawJob } from "../../models/index.js";
import type {
  JobSourceAdapter,
  JobSourceCapabilities,
  JobSearchQuery,
} from "./JobSourceAdapter.js";

/**
 * Phase 1 job source: the user pastes a job description manually. This lets the
 * ENTIRE pipeline (analyze → score → optimize → track → report) be exercised
 * end-to-end without depending on any external job website.
 *
 * It implements the same {@link JobSourceAdapter} interface that real search
 * adapters (LinkedIn, Indeed, Naukri, company career pages, ...) will implement
 * in later phases, so nothing downstream needs to change when they are added.
 */
export class ManualJobSourceAdapter implements JobSourceAdapter {
  readonly id = "manual";
  readonly label = "Manual input";
  readonly capabilities: JobSourceCapabilities = {
    canSearch: false,
    canFetchDetail: false,
    requiresAuth: false,
    usesOfficialApi: false,
  };

  async isReady(): Promise<boolean> {
    return true;
  }

  /** Turn a pasted description into a RawJob for the pipeline. */
  ingest(input: {
    description: string;
    title?: string;
    company?: string;
    location?: string;
    url?: string;
  }): RawJob {
    return {
      title: input.title,
      company: input.company,
      location: input.location,
      description: input.description,
      url: input.url,
      source: { adapter: this.id, label: this.label, url: input.url },
    };
  }

  async search(_query: JobSearchQuery): Promise<RawJob[]> {
    throw new Error(
      "ManualJobSourceAdapter does not support search. Paste a job description via the analyze_job tool. Automated search arrives in Phase 2.",
    );
  }
}
