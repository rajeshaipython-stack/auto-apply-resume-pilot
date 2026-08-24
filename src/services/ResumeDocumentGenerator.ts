import fs from "node:fs";
import path from "node:path";
import type { ParsedResume } from "../models/index.js";

/**
 * Renders a structured resume into ATS-friendly PDF and DOCX files.
 *
 * Simple single-column layout with standard headings — the format ATS parsers
 * handle most reliably. Content comes verbatim from the (already optimized,
 * never-invented) {@link ParsedResume}.
 */
export class ResumeDocumentGenerator {
  async generatePdf(resume: ParsedResume, outPath: string): Promise<string> {
    const PDFDocumentMod: any = await import("pdfkit");
    const PDFDocument = PDFDocumentMod.default ?? PDFDocumentMod;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const stream = fs.createWriteStream(outPath);
      stream.on("finish", () => resolve());
      stream.on("error", reject);
      doc.pipe(stream);

      const c = resume.contact;
      if (c.fullName) doc.fontSize(20).font("Helvetica-Bold").text(c.fullName);
      const contactBits = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
        .filter(Boolean)
        .join("  |  ");
      if (contactBits) doc.moveDown(0.2).fontSize(9).font("Helvetica").fillColor("#444").text(contactBits);
      doc.fillColor("#000");

      const heading = (t: string) => {
        doc.moveDown(0.8).fontSize(12).font("Helvetica-Bold").fillColor("#1a1a1a").text(t.toUpperCase());
        const y = doc.y + 2;
        doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
        doc.moveDown(0.4).fillColor("#000");
      };

      if (resume.summary) {
        heading("Summary");
        doc.fontSize(10).font("Helvetica").text(resume.summary, { align: "left" });
      }
      if (resume.skills.length) {
        heading("Skills");
        doc.fontSize(10).font("Helvetica").text(resume.skills.join(" • "));
      }
      if (resume.experience.length) {
        heading("Experience");
        for (const e of resume.experience) {
          const header = [e.title, e.company].filter(Boolean).join(" — ");
          const dates = [e.startDate, e.current ? "Present" : e.endDate].filter(Boolean).join(" – ");
          doc.moveDown(0.3).fontSize(10.5).font("Helvetica-Bold").text(header, { continued: !!dates });
          if (dates) doc.font("Helvetica-Oblique").fillColor("#555").text(`   ${dates}`).fillColor("#000");
          doc.font("Helvetica").fontSize(10);
          for (const b of e.bullets) doc.text(`•  ${b}`, { indent: 8 });
        }
      }
      if (resume.education.length) {
        heading("Education");
        for (const ed of resume.education) {
          doc
            .fontSize(10)
            .font("Helvetica")
            .text([ed.degree, ed.field, ed.institution, ed.endDate].filter(Boolean).join(", "));
        }
      }
      if (resume.certifications.length) {
        heading("Certifications");
        doc.fontSize(10).font("Helvetica").text(resume.certifications.join(" • "));
      }
      if (resume.languages.length) {
        heading("Languages");
        doc.fontSize(10).font("Helvetica").text(resume.languages.join(" • "));
      }

      doc.end();
    });
    return outPath;
  }

  async generateDocx(resume: ParsedResume, outPath: string): Promise<string> {
    const docx: any = await import("docx");
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const children: any[] = [];
    const c = resume.contact;
    if (c.fullName) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: c.fullName, bold: true, size: 40 })],
        }),
      );
    }
    const contactBits = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
      .filter(Boolean)
      .join("  |  ");
    if (contactBits) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: contactBits, size: 18, color: "444444" })] }),
      );
    }

    const heading = (t: string) =>
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: t.toUpperCase(), bold: true })],
        }),
      );
    const para = (t: string, opts: { bullet?: boolean; italic?: boolean } = {}) =>
      children.push(
        new Paragraph({
          bullet: opts.bullet ? { level: 0 } : undefined,
          children: [new TextRun({ text: t, italics: opts.italic })],
        }),
      );

    if (resume.summary) {
      heading("Summary");
      para(resume.summary);
    }
    if (resume.skills.length) {
      heading("Skills");
      para(resume.skills.join(" • "));
    }
    if (resume.experience.length) {
      heading("Experience");
      for (const e of resume.experience) {
        const header = [e.title, e.company].filter(Boolean).join(" — ");
        const dates = [e.startDate, e.current ? "Present" : e.endDate].filter(Boolean).join(" – ");
        children.push(
          new Paragraph({
            spacing: { before: 120 },
            children: [
              new TextRun({ text: header, bold: true }),
              dates ? new TextRun({ text: `   ${dates}`, italics: true, color: "555555" }) : new TextRun(""),
            ],
          }),
        );
        for (const b of e.bullets) para(b, { bullet: true });
      }
    }
    if (resume.education.length) {
      heading("Education");
      for (const ed of resume.education) {
        para([ed.degree, ed.field, ed.institution, ed.endDate].filter(Boolean).join(", "));
      }
    }
    if (resume.certifications.length) {
      heading("Certifications");
      para(resume.certifications.join(" • "));
    }
    if (resume.languages.length) {
      heading("Languages");
      para(resume.languages.join(" • "));
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    void AlignmentType;
    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buf);
    return outPath;
  }
}
