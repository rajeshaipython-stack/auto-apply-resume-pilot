import fs from "node:fs";
import path from "node:path";
import type { ApplicationRecord, ATSAnalysis, StructuredJob } from "../models/index.js";
import type { ApplicationTracker } from "./ApplicationTracker.js";

export interface ReportConfig {
  reportsDir: string;
  applicationsDir: string;
}

interface AppDetail {
  app: ApplicationRecord;
  job?: StructuredJob;
  original?: ATSAnalysis;
  optimized?: ATSAnalysis;
}

/**
 * Produces the final PDF application report and the per-application HTML
 * tracking pages. Reads immutable artifacts written by {@link ApplicationTracker}
 * from each `application-00X/` directory.
 */
export class ReportGenerator {
  constructor(private tracker: ApplicationTracker, private cfg: ReportConfig) {}

  private loadDetail(app: ApplicationRecord): AppDetail {
    const dir = path.join(this.cfg.applicationsDir, app.slug);
    const read = <T>(name: string): T | undefined => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T;
      } catch {
        return undefined;
      }
    };
    return {
      app,
      job: read<StructuredJob>("job.json"),
      original: read<ATSAnalysis>("original-ats.json"),
      optimized: read<ATSAnalysis>("optimized-ats.json"),
    };
  }

  summary(apps: ApplicationRecord[]) {
    const withOrig = apps.filter((a) => a.originalAtsScore !== undefined);
    const withOpt = apps.filter((a) => a.optimizedAtsScore !== undefined);
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
    const countStatus = (s: string) => apps.filter((a) => a.status === s).length;
    const applied = apps.filter((a) =>
      ["APPLIED", "APPLICATION_RECEIVED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"].includes(
        a.status,
      ),
    ).length;

    return {
      totalDiscovered: apps.length,
      totalAnalyzed: apps.filter((a) => a.originalAtsScore !== undefined).length,
      totalSelected: apps.filter((a) => (a.matchScore ?? 0) > 0).length,
      totalCustomized: apps.filter((a) => a.resumeVersion).length,
      totalApplications: applied,
      successfulApplications: applied,
      failedApplications: 0,
      pendingManualActions: apps.filter((a) => a.pendingManualActions.length > 0).length,
      interviews: countStatus("INTERVIEW"),
      rejected: countStatus("REJECTED"),
      offers: countStatus("OFFER"),
      avgOriginalAts: avg(withOrig.map((a) => a.originalAtsScore!)),
      avgOptimizedAts: avg(withOpt.map((a) => a.optimizedAtsScore!)),
    };
  }

  // ---- PDF ----------------------------------------------------------------
  async generatePdfReport(outPath?: string): Promise<string> {
    const apps = this.tracker.list();
    const details = apps.map((a) => this.loadDetail(a));
    const sum = this.summary(apps);
    const target = outPath ?? path.join(this.cfg.reportsDir, `resumepilot-report-${this.stamp()}.pdf`);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const PDFDocumentMod: any = await import("pdfkit");
    const PDFDocument = PDFDocumentMod.default ?? PDFDocumentMod;

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 45 });
      const stream = fs.createWriteStream(target);
      stream.on("finish", () => resolve());
      stream.on("error", reject);
      doc.pipe(stream);

      // Title
      doc.fontSize(22).font("Helvetica-Bold").fillColor("#111").text("ResumePilot — Application Report");
      doc.fontSize(9).font("Helvetica").fillColor("#666").text(`Generated ${new Date().toLocaleString()}`);
      doc.moveDown(0.8).fillColor("#000");

      // Summary
      this.pdfHeading(doc, "Summary");
      const rows: [string, string | number][] = [
        ["Total jobs discovered", sum.totalDiscovered],
        ["Total jobs analyzed", sum.totalAnalyzed],
        ["Total jobs selected", sum.totalSelected],
        ["Total resumes customized", sum.totalCustomized],
        ["Total applications", sum.totalApplications],
        ["Successful applications", sum.successfulApplications],
        ["Failed applications", sum.failedApplications],
        ["Pending / manual actions", sum.pendingManualActions],
        ["Interviews", sum.interviews],
        ["Offers", sum.offers],
        ["Rejected", sum.rejected],
        ["Average original ATS score", sum.avgOriginalAts],
        ["Average optimized ATS score", sum.avgOptimizedAts],
      ];
      doc.fontSize(10).font("Helvetica");
      for (const [k, v] of rows) {
        doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(String(v));
      }

      // Application table
      this.pdfHeading(doc, "Applications");
      if (apps.length === 0) {
        doc.fontSize(10).font("Helvetica-Oblique").fillColor("#666").text("No applications yet.").fillColor("#000");
      }
      for (const d of details) {
        this.pdfAppRow(doc, d);
      }

      // Detailed sections
      for (const d of details) {
        doc.addPage();
        this.pdfAppDetail(doc, d);
      }

      doc.end();
    });

    return target;
  }

  private pdfHeading(doc: any, t: string): void {
    doc.moveDown(0.9).fontSize(14).font("Helvetica-Bold").fillColor("#1a1a1a").text(t);
    const y = doc.y + 2;
    doc.moveTo(45, y).lineTo(550, y).strokeColor("#bbb").stroke();
    doc.moveDown(0.4).fillColor("#000");
  }

  private pdfAppRow(doc: any, d: AppDetail): void {
    const a = d.app;
    doc.moveDown(0.5).fontSize(11).font("Helvetica-Bold").fillColor("#0b5");
    doc.fillColor("#111").text(`#${a.number}  ${a.company ?? "Unknown company"} — ${a.role ?? "Unknown role"}`);
    doc.fontSize(9).font("Helvetica").fillColor("#333");
    const bits = [
      `Source: ${a.jobSourceAdapter}`,
      a.jobUrl ? `URL: ${a.jobUrl}` : undefined,
      `Applied: ${a.appliedAt ? new Date(a.appliedAt).toLocaleDateString() : "—"}`,
      `Original ATS: ${a.originalAtsScore ?? "—"}`,
      `Optimized ATS: ${a.optimizedAtsScore ?? "—"}`,
      `Match: ${a.matchScore ?? "—"}`,
      `Status: ${a.status}`,
      `Resume: ${a.resumeVersion ?? "—"}`,
    ].filter(Boolean);
    doc.text(bits.join("   |   "));
    if (a.resumePdfPath) doc.fillColor("#06c").text(`Resume file: ${a.resumePdfPath}`).fillColor("#000");
    doc.fillColor("#000");
  }

  private pdfAppDetail(doc: any, d: AppDetail): void {
    const a = d.app;
    doc.fontSize(15).font("Helvetica-Bold").fillColor("#111").text(`Application #${a.number} — ${a.company ?? ""}`);
    doc.fontSize(11).font("Helvetica").fillColor("#333").text(a.role ?? "");
    doc.fillColor("#000").moveDown(0.4);

    if (d.job) {
      doc.fontSize(11).font("Helvetica-Bold").text("Job description summary");
      doc.fontSize(9.5).font("Helvetica").text(this.truncate(d.job.rawDescription, 600));
      if (d.job.keywords.length) {
        doc.moveDown(0.2).font("Helvetica-Bold").fontSize(10).text("Required keywords:");
        doc.font("Helvetica").fontSize(9.5).text(d.job.keywords.slice(0, 25).join(", "));
      }
    }

    if (d.original && d.optimized) {
      doc.moveDown(0.4).fontSize(11).font("Helvetica-Bold").text("ATS scores");
      doc.fontSize(10).font("Helvetica").text(
        `Original ATS: ${d.original.atsScore}   →   Optimized ATS: ${d.optimized.atsScore}   (Match: ${d.optimized.overallMatchScore})`,
      );
      if (d.optimized.missingKeywords.length) {
        doc.moveDown(0.2).font("Helvetica-Bold").fontSize(10).text("Missing points (not invented):");
        doc.font("Helvetica").fontSize(9.5).text(d.optimized.missingKeywords.slice(0, 20).join(", "));
      }
      const recs = d.optimized.recommendations.length ? d.optimized.recommendations : d.original.recommendations;
      if (recs.length) {
        doc.moveDown(0.2).font("Helvetica-Bold").fontSize(10).text("Changes / recommendations:");
        doc.font("Helvetica").fontSize(9.5);
        for (const r of recs.slice(0, 8)) doc.text(`• ${r}`);
      }
    }

    doc.moveDown(0.4).fontSize(11).font("Helvetica-Bold").text("Application timeline");
    doc.fontSize(9.5).font("Helvetica");
    for (const t of this.tracker.timeline(a)) {
      doc.text(`• ${new Date(t.at).toLocaleString()} — ${t.status}${t.note ? ` (${t.note})` : ""} [${t.source}]`);
    }

    if (a.emailUpdates.length) {
      doc.moveDown(0.3).fontSize(11).font("Helvetica-Bold").text("Email tracking updates");
      doc.fontSize(9.5).font("Helvetica");
      for (const e of a.emailUpdates) {
        doc.text(`• ${e.date ?? ""} — ${e.sender ?? ""}: ${e.subject ?? ""}${e.extractedStatus ? ` → ${e.extractedStatus}` : ""}`);
      }
    }

    if (a.resumePdfPath || a.resumeDocxPath) {
      doc.moveDown(0.3).fontSize(11).font("Helvetica-Bold").text("Customized resume files");
      doc.fontSize(9.5).font("Helvetica").fillColor("#06c");
      if (a.resumePdfPath) doc.text(a.resumePdfPath);
      if (a.resumeDocxPath) doc.text(a.resumeDocxPath);
      doc.fillColor("#000");
    }
  }

  // ---- HTML tracking pages ------------------------------------------------
  async generateTrackingPages(): Promise<{ indexPath: string; pages: string[] }> {
    const apps = this.tracker.list();
    const outDir = path.join(this.cfg.reportsDir, "tracking");
    fs.mkdirSync(outDir, { recursive: true });
    const pages: string[] = [];

    for (const app of apps) {
      const d = this.loadDetail(app);
      const file = path.join(outDir, `${app.slug}.html`);
      fs.writeFileSync(file, this.trackingHtml(d), "utf8");
      pages.push(file);
    }
    const indexPath = path.join(outDir, "index.html");
    fs.writeFileSync(indexPath, this.indexHtml(apps), "utf8");
    return { indexPath, pages };
  }

  private esc(s: unknown): string {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private indexHtml(apps: ApplicationRecord[]): string {
    const rows = apps
      .map(
        (a) => `<tr>
        <td>${a.number}</td>
        <td>${this.esc(a.company)}</td>
        <td>${this.esc(a.role)}</td>
        <td>${this.esc(a.jobSourceAdapter)}</td>
        <td>${a.originalAtsScore ?? "—"}</td>
        <td>${a.optimizedAtsScore ?? "—"}</td>
        <td>${a.matchScore ?? "—"}</td>
        <td><span class="badge">${a.status}</span></td>
        <td><a href="./${a.slug}.html">Tracking</a></td>
      </tr>`,
      )
      .join("\n");
    return this.htmlShell(
      "ResumePilot — Applications",
      `<h1>ResumePilot — Applications</h1>
       <table>
         <thead><tr><th>#</th><th>Company</th><th>Role</th><th>Source</th><th>Orig ATS</th><th>Opt ATS</th><th>Match</th><th>Status</th><th></th></tr></thead>
         <tbody>${rows || '<tr><td colspan="9">No applications yet.</td></tr>'}</tbody>
       </table>`,
    );
  }

  private trackingHtml(d: AppDetail): string {
    const a = d.app;
    const steps = this.tracker
      .timeline(a)
      .map(
        (t) =>
          `<li><strong>${t.status}</strong> <span class="muted">${new Date(t.at).toLocaleString()} · ${this.esc(t.source)}</span>${t.note ? `<br><span class="muted">${this.esc(t.note)}</span>` : ""}</li>`,
      )
      .join("\n");
    const emails = a.emailUpdates.length
      ? a.emailUpdates
          .map(
            (e) =>
              `<tr><td>${this.esc(e.sender)}</td><td>${this.esc(e.subject)}</td><td>${this.esc(e.date)}</td><td>${this.esc(e.extractedStatus)}</td></tr>`,
          )
          .join("\n")
      : `<tr><td colspan="4" class="muted">No emails linked yet (Phase 5).</td></tr>`;

    return this.htmlShell(
      `Tracking — ${this.esc(a.company)} #${a.number}`,
      `<a href="./index.html">&larr; All applications</a>
       <h1>${this.esc(a.company)} — ${this.esc(a.role)}</h1>
       <p class="muted">Application #${a.number} · Source: ${this.esc(a.jobSourceAdapter)} · Status: <span class="badge">${a.status}</span></p>
       <div class="grid">
         <div class="card"><div class="k">Original ATS</div><div class="v">${a.originalAtsScore ?? "—"}</div></div>
         <div class="card"><div class="k">Optimized ATS</div><div class="v">${a.optimizedAtsScore ?? "—"}</div></div>
         <div class="card"><div class="k">Match</div><div class="v">${a.matchScore ?? "—"}</div></div>
       </div>
       <h2>Timeline</h2>
       <ol class="timeline">${steps}</ol>
       <h2>Email tracking</h2>
       <table><thead><tr><th>Sender</th><th>Subject</th><th>Date</th><th>Extracted status</th></tr></thead><tbody>${emails}</tbody></table>
       ${
         a.pendingManualActions.length
           ? `<h2>Manual actions required</h2><ul>${a.pendingManualActions.map((m) => `<li>${this.esc(m)}</li>`).join("")}</ul>`
           : ""
       }`,
    );
  }

  private htmlShell(title: string, body: string): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${this.esc(title)}</title>
<style>
  :root{--bg:#0b0d10;--card:#151a21;--fg:#e8edf2;--muted:#8b98a5;--acc:#4c9ffe;--line:#232a33}
  @media (prefers-color-scheme:light){:root{--bg:#f6f8fa;--card:#fff;--fg:#111;--muted:#667;--acc:#0969da;--line:#e2e8f0}}
  *{box-sizing:border-box}body{margin:0;padding:2rem;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
  h1{font-size:1.5rem;margin:.2rem 0}h2{margin-top:1.6rem;border-bottom:1px solid var(--line);padding-bottom:.3rem}
  a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
  .muted{color:var(--muted);font-size:.85rem}
  table{width:100%;border-collapse:collapse;margin-top:.6rem;overflow-x:auto;display:block}
  th,td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid var(--line);font-size:.9rem}
  .badge{background:var(--acc);color:#fff;padding:.1rem .5rem;border-radius:99px;font-size:.75rem}
  .grid{display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1rem 1.4rem;min-width:120px}
  .card .k{color:var(--muted);font-size:.8rem}.card .v{font-size:1.8rem;font-weight:700}
  ol.timeline{list-style:none;padding-left:1rem;border-left:2px solid var(--line)}
  ol.timeline li{margin:.6rem 0;position:relative}
  ol.timeline li::before{content:"";position:absolute;left:-1.35rem;top:.35rem;width:10px;height:10px;border-radius:50%;background:var(--acc)}
</style></head><body>${body}
<footer class="muted" style="margin-top:2rem">Generated by ResumePilot MCP · local tracking page</footer>
</body></html>`;
  }

  private truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + "…" : s;
  }
  private stamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
}
