import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildDocumentPdf, toPdfText } from "@/lib/document-pdf";

describe("document PDF (US-14)", () => {
  it("keeps French accents and replaces characters the PDF font cannot show", () => {
    expect(toPdfText("Hémoglobine – œdème")).toBe("Hémoglobine – œdème");
    expect(toPdfText("سلام 😀")).toBe("???? ?");
  });

  it("builds a valid PDF, on several pages when the text is long", async () => {
    const bytes = await buildDocumentPdf({
      title: "Compte rendu de consultation",
      patient: "BENSO Ameni",
      meta: [["Praticien", "Dr Karim Gharbi"]],
      sections: [{ heading: "Observations", body: "Tension normale. ".repeat(600) }],
      table: [["Glycémie", "0,95 g/L"]],
      generatedAt: new Date("2026-11-07T10:00:00Z"),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
