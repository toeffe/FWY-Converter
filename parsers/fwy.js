import { extractPdfLines } from "./pdf.js";

const SKIP_RE =
  /^(vendor\b|arrival notice|transporter:|total qty|fwy order|^\d+\s*\/\s*\d+$|--\s*\d+\s+of\s+\d+\s*--)/i;

const DATE_TOKEN_RE =
  /^(\d{2})[-./](\d{2})[-./](\d{4})(?:[T,\s]*\d{2}:\d{2}(?::\d{2})?)?$/;
const SHORT_INT_RE = /^\d{1,7}$/;
const EAN_TOKEN_RE = /^(None|\d{8,})$/i;

function normalizeDateToken(token) {
  const match = DATE_TOKEN_RE.exec(String(token || "").trim());
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Tokenizes and interprets a single pallet row.
 *
 * The row has one reliable anchor: the On stock date (dd-mm-yyyy, also
 * dd/mm/yyyy or dd.mm.yyyy). Everything before it is the vendor name
 * (which may itself contain spaces). Everything after it is read
 * token-by-token in the expected column order, but any numeric/EAN column
 * is allowed to be missing — if the next token doesn't look like that
 * column's expected shape, the column is left blank and the same token is
 * re-tried against the next column instead of being consumed and silently
 * misaligning everything after it.
 *
 * Item / pcs / pall / qty only consume 1–7 digit integers so an EAN is not
 * taken as quantity. Returns null if the line isn't a pallet row at all
 * (no date anchor found).
 */
function parsePalletRow(line) {
  const tokens = line.split(" ").filter(Boolean);

  const dateIndex = tokens.findIndex((token) => DATE_TOKEN_RE.test(token));
  if (dateIndex === -1) return null;

  const vendor = tokens.slice(0, dateIndex).join(" ").trim();
  if (!vendor) return null;

  const onStock = normalizeDateToken(tokens[dateIndex]);
  let cursor = dateIndex + 1;

  const takeIf = (predicate) => {
    const token = tokens[cursor];
    if (token != null && predicate(token)) {
      cursor += 1;
      return token;
    }
    return null;
  };

  const itemNr = takeIf((t) => SHORT_INT_RE.test(t)) || "";
  const pcsPerCrt = takeIf((t) => SHORT_INT_RE.test(t));
  const pallNo = takeIf((t) => SHORT_INT_RE.test(t)) || "";
  const crtPerPall = takeIf((t) => SHORT_INT_RE.test(t));

  const ean = takeIf((t) => EAN_TOKEN_RE.test(t));
  const caseEan = takeIf((t) => EAN_TOKEN_RE.test(t));

  const text = tokens.slice(cursor).join(" ").trim();

  return {
    vendor,
    onStock,
    itemNr,
    pcsPerCrt: pcsPerCrt != null ? Number(pcsPerCrt) : null,
    pallNo,
    crtPerPall: crtPerPall != null ? Number(crtPerPall) : null,
    ean: ean && ean.toLowerCase() !== "none" ? ean : "",
    caseEan: caseEan && caseEan.toLowerCase() !== "none" ? caseEan : "",
    text,
  };
}

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

    const qtyMatch = line.match(/TOTAL QTY CASES:\s*(.+)/i);
    if (qtyMatch) {
      const digits = qtyMatch[1].replace(/\D/g, "");
      header.totalQtyCases = digits ? Number(digits) : null;
      continue;
    }

    const docDateMatch = line.match(/^(\d{2}[-./]\d{2}[-./]\d{4})(?:\s+\d{2}:\d{2})?$/);
    if (docDateMatch && !header.documentDate) {
      header.documentDate = normalizeDateToken(docDateMatch[1]);
      continue;
    }

    if (SKIP_RE.test(line)) continue;

    const pallet = parsePalletRow(line);
    if (!pallet) continue;

    pallets.push({
      ...pallet,
      pcsPerCrt: pallet.pcsPerCrt ?? 0,
      crtPerPall: pallet.crtPerPall ?? 0,
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
