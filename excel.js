import { TEMPLATE_BASE64 } from "./template.js";

const COL = {
  orderRef: 1,
  supplierId: 2,
  supplierReference: 3,
  supplierName: 4,
  supplierLanguage: 11,
  deliveryFrom: 12,
  deliveryTo: 13,
  item: 14,
  lot: 15,
  bbd: 16,
  stockType: 17,
  quantity: 19,
  transporterLanguage: 28,
  confirmationEmail: 29,
  warehouseEmail: 30,
};

const STATIC_LANGUAGE = "ENG";

function parseDateValue(value) {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0));
  }
  const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!dmy) return null;
  return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12, 0, 0));
}

function setText(row, col, value) {
  const cell = row.getCell(col);
  cell.value = value == null || value === "" ? null : String(value);
  cell.numFmt = "@";
}

function setDate(row, col, value) {
  const cell = row.getCell(col);
  const date = parseDateValue(value);
  if (!date) {
    cell.value = null;
    return;
  }
  cell.value = date;
  cell.numFmt = "mm-dd-yy";
}

function templateBuffer() {
  const binary = atob(TEMPLATE_BASE64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function buildInboundWorkbook(state) {
  if (!window.ExcelJS) {
    throw new Error("ExcelJS failed to load.");
  }

  const workbook = new window.ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer());

  const sheet = workbook.getWorksheet("Order Lines");
  if (!sheet) {
    throw new Error("Template is missing the Order Lines sheet.");
  }

  const { pallets } = state;
  pallets.forEach((pallet, index) => {
    const row = sheet.getRow(index + 2);
    setText(row, COL.orderRef, state.orderRef);
    setText(row, COL.supplierId, state.supplierId);
    setText(row, COL.supplierReference, state.supplierReference);
    setText(row, COL.supplierName, "");
    setText(row, COL.supplierLanguage, STATIC_LANGUAGE);
    setDate(row, COL.deliveryFrom, state.deliveryDate);
    setDate(row, COL.deliveryTo, state.deliveryDate);
    setText(row, COL.item, pallet.itemNr);
    setText(row, COL.lot, pallet.pallNo);
    setText(row, COL.bbd, pallet.bbd);
    setText(row, COL.stockType, state.stockType);
    setText(row, COL.transporterLanguage, STATIC_LANGUAGE);
    setText(row, COL.confirmationEmail, state.confirmationEmail);
    setText(row, COL.warehouseEmail, state.warehouseEmail);
    row.getCell(COL.quantity).value = pallet.qty ?? pallet.crtPerPall;
    row.getCell(COL.quantity).numFmt = "0";
    row.commit();
  });

  return workbook;
}

export async function downloadInboundXlsx(state) {
  const workbook = await buildInboundWorkbook(state);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const name = `${state.orderRef || "inbound"}_inbound.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}
