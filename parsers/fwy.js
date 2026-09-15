import { extractPdfLines } from "./pdf.js";

const LINE_RE =
  /^(.+?)\s+(\d{2}-\d{2}-\d{4})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/;

const SKIP_RE =
  /^(vendor\b|arrival notice|transporter:|total qty|fwy order|^\d+\s*\/\s*\d+$|--\s*\d+\s+of\s+\d+\s*--)/i;

export function parseFwyArrivalNoticeLines(lines) {
  const header = {
    orderRef: "",
    extraOrders: [],
    transporter: "",
    totalQtyCases: null,
    documentDate: "",
  };
  const pallets = [];

  for (const line of lines) {
    const orderMatch = line.match(/FWY ORDER no\.?:\s*(.+)/i);
    if (orderMatch) {
      const numbers = orderMatch[1].match(/\d+/g) || [];
      header.orderRef = numbers[0] || "";
      header.extraOrders = numbers.slice(1);
      continue;
    }

    const transporterMatch = line.match(/^TRANSPORTER:\s*(.*)$/i);
    if (transporterMatch) {
      header.transporter = transporterMatch[1].trim();
      continue;
    }

    const qtyMatch = line.match(/TOTAL QTY CASES:\s*(\d+)/i);
    if (qtyMatch) {
      header.totalQtyCases = Number(qtyMatch[1]);
      continue;
    }

    const docDateMatch = line.match(/^(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?$/);
    if (docDateMatch && !header.documentDate) {
      header.documentDate = docDateMatch[1];
      continue;
    }

    if (SKIP_RE.test(line)) continue;

    const row = LINE_RE.exec(line);
    if (!row) continue;

    pallets.push({
      vendor: row[1].trim(),
      onStock: row[2],
      itemNr: row[3],
      pcsPerCrt: Number(row[4]),
      pallNo: row[5],
      crtPerPall: Number(row[6]),
      ean: row[7],
      caseEan: row[8],
      text: row[9].trim(),
    });
  }

  const totalCases = pallets.reduce((sum, pallet) => sum + pallet.crtPerPall, 0);
  const qtyMismatch =
    header.totalQtyCases != null && header.totalQtyCases !== totalCases;

  return {
    header,
    pallets,
    totalCases,
    qtyMismatch,
  };
}

export async function parseFwyArrivalNotice(arrayBuffer) {
  const lines = await extractPdfLines(arrayBuffer);
  return parseFwyArrivalNoticeLines(lines);
}
