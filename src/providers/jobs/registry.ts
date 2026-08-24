import type { JobSourceAdapter } from "./JobSourceAdapter.js";
import { ManualJobSourceAdapter } from "./ManualJobSourceAdapter.js";

/**
 * Registry of available job-source adapters. New sources are added here (or
 * registered at runtime) without touching the core pipeline.
 *
 * Phase 1 ships only the manual adapter. Phase 2+ registers search adapters
 * (LinkedIn, Indeed, Naukri, GenericCompanyCareer, ATS pages, public APIs, ...).
 */
export class JobSourceRegistry {
  private adapters = new Map<string, JobSourceAdapter>();

  constructor() {
    this.register(new ManualJobSourceAdapter());
  }

  register(adapter: JobSourceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): JobSourceAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): JobSourceAdapter[] {
    return [...this.adapters.values()];
  }

  describe(): { id: string; label: string; capabilities: JobSourceAdapter["capabilities"] }[] {
    return this.list().map((a) => ({ id: a.id, label: a.label, capabilities: a.capabilities }));
  }
}
