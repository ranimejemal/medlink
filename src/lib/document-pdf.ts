// US-14: builds the PDF of a validated consultation report or exam result.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfSection = { heading: string; body: string };
export type PdfDocumentInput = {
  title: string;
  patient: string;
  meta: [string, string][]; // e.g. ["Praticien", "Dr Karim Gharbi"]
  sections: PdfSection[];
  table?: [string, string][];
  generatedAt: Date;
};

// The standard PDF fonts only know the Windows-1252 characters (French accents included).
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function toPdfText(s: string) {
  return s
    .replace(/\t/g, " ")
    .replace(/[\u2010-\u2011]/g, "-")
    .replace(/\u202f|\u2009/g, " ")
    .replace(/./gu, (c) => {
      const code = c.codePointAt(0) ?? 0;
      return (code >= 0x20 && code <= 0x7e) ||
        (code >= 0xa0 && code <= 0xff) ||
        CP1252_EXTRA.includes(c)
        ? c
        : "?";
    });
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of toPdfText(text).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // A single word longer than the line is cut.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines;
}

export async function buildDocumentPdf(doc: PdfDocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(toPdfText(doc.title));
  pdf.setProducer("MedLink");
  pdf.setCreationDate(doc.generatedAt);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28; // A4
  const H = 841.89;
  const M = 50;
  const width = W - 2 * M;
  const navy = rgb(0.04, 0.12, 0.23);
  const grey = rgb(0.39, 0.45, 0.55);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (h: number) => {
    if (y - h < M + 30) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const write = (text: string, font: PDFFont, size: number, color = navy, gap = 4) => {
    for (const line of wrap(text, font, size, width)) {
      ensure(size + gap);
      page.drawText(line, { x: M, y: y - size, size, font, color });
      y -= size + gap;
    }
  };

  write("MedLink", bold, 20);
  write("Portail médical sécurisé — document confidentiel", regular, 9, grey);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: navy });
  y -= 18;
  write(doc.title, bold, 15);
  y -= 4;
  write(`Patient : ${doc.patient}`, regular, 11);
  for (const [k, v] of doc.meta) write(`${k} : ${v}`, regular, 11);
  y -= 10;

  for (const s of doc.sections) {
    if (!s.body.trim()) continue;
    ensure(40);
    write(s.heading, bold, 12);
    write(s.body, regular, 11);
    y -= 8;
  }

  if (doc.table?.length) {
    ensure(40);
    write("Valeurs", bold, 12);
    for (const [k, v] of doc.table) {
      const keyLines = wrap(k, regular, 10, width * 0.45);
      const valLines = wrap(v, bold, 10, width * 0.5);
      const rows = Math.max(keyLines.length, valLines.length);
      ensure(rows * 14 + 4);
      for (let i = 0; i < rows; i++) {
        if (keyLines[i])
          page.drawText(keyLines[i]!, { x: M, y: y - 10, size: 10, font: regular, color: grey });
        if (valLines[i])
          page.drawText(valLines[i]!, {
            x: M + width * 0.5,
            y: y - 10,
            size: 10,
            font: bold,
            color: navy,
          });
        y -= 14;
      }
      y -= 2;
    }
  }

  const stamp = toPdfText(
    `Généré le ${doc.generatedAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Tunis" })} — téléchargement enregistré (journal d'audit).`,
  );
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(stamp, { x: M, y: 28, size: 8, font: regular, color: grey });
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: W - M - 30,
      y: 28,
      size: 8,
      font: regular,
      color: grey,
    });
  });

  return pdf.save();
}
