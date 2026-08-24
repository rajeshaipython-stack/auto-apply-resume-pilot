import type { RawJob } from "../../models/index.js";

/**
 * Capabilities a job source may or may not support. Lets the pipeline reason
 * about what an adapter can legally/technically do without hard-coding site
 * specifics.
 */
export interface JobSourceCapabilities {
  /** Can programmatically search for jobs (vs. manual paste only). */
  canSearch: boolean;
  /** Can fetch full job detail for a given posting. */
  canFetchDetail: boolean;
  /** Requires an authenticated session / OAuth before use. */
  requiresAuth: boolean;
  /** Uses an official API (true) vs permitted browser automation (false). */
  usesOfficialApi: boolean;
}

export interface JobSearchQuery {
  keywords?: string[];
  roles?: string[];
  locations?: string[];
  workMode?: "remote" | "hybrid" | "on-site";
  /** Hard cap on results this call should return. */
  limit?: number;
}

/**
 * Provider interface for any job source: professional networks, global/regional
 * job boards, company career pages, public job APIs, supported ATS pages, etc.
 *
 * New sources are added by implementing this interface and registering the
 * adapter — the core pipeline never changes. Adapters MUST respect the source's
 * authentication, robots/terms, rate limits and anti-bot protections, and MUST
 * NOT scrape blindly or bypass protections.
 */
export interface JobSourceAdapter {
  /** Stable id, e.g. "manual", "linkedin", "indeed", "greenhouse". */
  readonly id: string;
  readonly label: string;
  readonly capabilities: JobSourceCapabilities;

  /** Is this adapter ready to use (authenticated / configured)? */
  isReady(): Promise<boolean>;

  /**
   * Establish an authenticated session via the source's OFFICIAL login/OAuth
   * flow. Phase 1 adapters that need no auth resolve immediately. Adapters must
   * never accept or store raw passwords/OTPs.
   */
  connect?(): Promise<{ connected: boolean; message?: string }>;

  /**
   * Return jobs matching the query, up to `query.limit`. Manual adapter throws
   * (use {@link ingest}); search adapters implement this in Phase 2+.
   */
  search(query: JobSearchQuery): Promise<RawJob[]>;
}
