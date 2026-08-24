import type { EmailUpdate } from "../../models/index.js";
import {
  EmailProvider,
  EmailSearchQuery,
  classifyEmailStatus,
} from "./EmailProvider.js";

/**
 * A deterministic, offline email provider used for Phase 1 testing and demos.
 *
 * It never touches a real inbox. You can seed it with sample messages so the
 * tracking pipeline (search emails → classify → update status) can be exercised
 * end-to-end. The real GmailProvider (Phase 5) implements the same interface.
 */
export class MockEmailProvider implements EmailProvider {
  readonly id = "mock";
  readonly label = "Mock inbox (offline)";
  private seeded: EmailUpdate[] = [];

  seed(messages: Omit<EmailUpdate, "extractedStatus">[]): void {
    for (const m of messages) {
      this.seeded.push({
        ...m,
        extractedStatus: classifyEmailStatus(`${m.subject ?? ""} ${m.snippet ?? ""}`),
      });
    }
  }

  async isReady(): Promise<boolean> {
    return true;
  }

  async search(query: EmailSearchQuery): Promise<EmailUpdate[]> {
    const c = query.company?.toLowerCase();
    const dom = query.domain?.toLowerCase();
    // Company/domain are the reliable filters. Role is NOT a hard filter — many
    // legitimate recruiter emails (e.g. "Interview invitation") omit the title.
    return this.seeded
      .filter((m) => {
        const hay = `${m.sender ?? ""} ${m.subject ?? ""} ${m.snippet ?? ""}`.toLowerCase();
        const senderLc = (m.sender ?? "").toLowerCase();
        const companyOk = !c || hay.includes(c) || (!!dom && senderLc.includes(dom));
        const domainOk = !dom || senderLc.includes(dom);
        return companyOk && domainOk;
      })
      .slice(0, query.limit ?? 25);
  }
}
