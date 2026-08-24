import type { ApplicationAdapter } from "./ApplicationAdapter.js";
import { ManualApplicationAdapter } from "./ManualApplicationAdapter.js";

/**
 * Registry of application-automation adapters. Phase 1 ships the manual,
 * human-in-the-loop adapter. Phase 4 registers supported site adapters that
 * only auto-submit where technically and legally permitted.
 */
export class ApplicationAdapterRegistry {
  private adapters = new Map<string, ApplicationAdapter>();

  constructor() {
    this.register(new ManualApplicationAdapter());
  }

  register(adapter: ApplicationAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ApplicationAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Choose an adapter for a job; falls back to the manual adapter. */
  resolveFor(_sourceAdapter: string): ApplicationAdapter {
    return this.get("manual")!;
  }

  list(): ApplicationAdapter[] {
    return [...this.adapters.values()];
  }
}
