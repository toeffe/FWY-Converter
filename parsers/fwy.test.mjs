import assert from "node:assert/strict";
import test from "node:test";
import { parseFwyArrivalNoticeLines } from "./fwy.js";
import { clusterTextItems } from "./pdf.js";

function glyph(str, x, y = 100, width = 10, height = 12) {
  return { str, transform: [1, 0, 0, 1, x, y], width, height };
}

test("joins adjacent PDF glyphs without a space", () => {
  const lines = clusterTextItems([
    glyph("12", 0, 100, 10),
    glyph("345", 10.2, 100, 15),
  ]);
  assert.deepEqual(lines, ["12345"]);
});

test("keeps a space between distant PDF glyphs", () => {
  const lines = clusterTextItems([
    glyph("12", 0, 100, 10),
    glyph("345", 40, 100, 15),
  ]);
  assert.deepEqual(lines, ["12 345"]);
});

test("does not use an EAN as qty, lot, or item", () => {
  const parsed = parseFwyArrivalNoticeLines([
    "Acme Foods 16-09-2026 12345 6 10 12 5701234567890 5701234567891 Product name",
  ]);
  assert.equal(parsed.pallets.length, 1);
  const pallet = parsed.pallets[0];
  assert.equal(pallet.itemNr, "12345");
  assert.equal(pallet.pallNo, "10");
  assert.equal(pallet.crtPerPall, 12);
  assert.equal(pallet.ean, "5701234567890");
  assert.equal(pallet.caseEan, "5701234567891");
  assert.equal(pallet.text, "Product name");
});

test("skips EAN-length tokens when qty is missing", () => {
  const parsed = parseFwyArrivalNoticeLines([
    "Acme Foods 16-09-2026 12345 6 10 5701234567890 5701234567891 Product name",
  ]);
  const pallet = parsed.pallets[0];
  assert.equal(pallet.itemNr, "12345");
  assert.equal(pallet.pallNo, "10");
  assert.equal(pallet.crtPerPall, 0);
  assert.equal(pallet.ean, "5701234567890");
});

test("parses TOTAL QTY CASES with thousand separators", () => {
  const parsed = parseFwyArrivalNoticeLines([
    "TOTAL QTY CASES: 1,234",
    "Acme Foods 16-09-2026 1 2 3 4 Product",
  ]);
  assert.equal(parsed.header.totalQtyCases, 1234);
  assert.equal(parsed.totalCases, 4);
  assert.equal(parsed.qtyMismatch, true);
});

test("keeps the first FWY order number and records extras", () => {
  const parsed = parseFwyArrivalNoticeLines([
    "FWY ORDER no.: 111 222 333",
    "Acme Foods 16-09-2026 1 2 3 4 Product",
  ]);
  assert.equal(parsed.header.orderRef, "111");
  assert.deepEqual(parsed.header.extraOrders, ["222", "333"]);
});

test("keeps incomplete pallet rows instead of dropping them", () => {
  const parsed = parseFwyArrivalNoticeLines(["Acme Foods 16-09-2026 Product only"]);
  assert.equal(parsed.pallets.length, 1);
  const pallet = parsed.pallets[0];
  assert.equal(pallet.vendor, "Acme Foods");
  assert.equal(pallet.onStock, "16-09-2026");
  assert.equal(pallet.itemNr, "");
  assert.equal(pallet.pallNo, "");
  assert.equal(pallet.crtPerPall, 0);
  assert.equal(pallet.text, "Product only");
});

test("normalizes slash dates and glued times", () => {
  const parsed = parseFwyArrivalNoticeLines([
    "Acme Foods 16/09/2026,12:00 1 2 3 4 Product",
  ]);
  assert.equal(parsed.pallets[0].onStock, "16-09-2026");
  assert.equal(parsed.pallets[0].crtPerPall, 4);
});
