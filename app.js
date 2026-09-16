import { downloadInboundXlsx } from "./excel.js";
import { getProfile, profiles } from "./profiles.js";

const SOURCE_KEY = "inbound-source";
const BBD_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

const els = {
  dropzone: document.getElementById("dropzone"),
  dropHint: document.getElementById("dropHint"),
  fileInput: document.getElementById("fileInput"),
  status: document.getElementById("status"),
  summary: document.getElementById("summary"),
  itemsSection: document.getElementById("itemsSection"),
  palletsSection: document.getElementById("palletsSection"),
  itemBody: document.getElementById("itemBody"),
  palletBody: document.getElementById("palletBody"),
  downloadBtn: document.getElementById("downloadBtn"),
  sourceSelect: document.getElementById("sourceSelect"),
  orderRef: document.getElementById("orderRef"),
  supplierId: document.getElementById("supplierId"),
  supplierReference: document.getElementById("supplierReference"),
  confirmEmail: document.getElementById("confirmEmail"),
  warehouseEmail: document.getElementById("warehouseEmail"),
  deliveryDate: document.getElementById("deliveryDate"),
};

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredSource() {
  try {
    return localStorage.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSource(id) {
  try {
    localStorage.setItem(SOURCE_KEY, id);
  } catch {
    // Private mode or blocked storage must not kill the page.
  }
}

els.deliveryDate.value = todayIso();

let activeProfile = getProfile(readStoredSource());
let state = null;

function applyProfileDefaults() {
  els.supplierId.value = activeProfile.defaults.supplierId || "";
  els.supplierReference.value = activeProfile.defaults.supplierReference || "";
  els.dropHint.textContent = activeProfile.dropHint || "";
}

function clearLoadedPdf() {
  state = null;
  els.orderRef.value = "";
  els.fileInput.value = "";
  showStatus("");
  render();
}

function populateSourceSelect() {
  els.sourceSelect.innerHTML = profiles
    .map(
      (profile) =>
        `<option value="${escapeAttr(profile.id)}" ${profile.id === activeProfile.id ? "selected" : ""}>${escapeHtml(profile.name)}</option>`
    )
    .join("");
}

function showStatus(message, ok = false) {
  els.status.hidden = !message;
  els.status.textContent = message || "";
  els.status.classList.toggle("ok", ok);
}

function formatBbd(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function isValidBbd(value) {
  if (!value) return true;
  const match = BBD_RE.exec(value);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isCompleteBbd(value) {
  return Boolean(value) && isValidBbd(value);
}

function isFilledEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isFilledText(value) {
  return Boolean(String(value || "").trim());
}

function isPositiveQty(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

function caseTotal() {
  if (!state?.pallets.length) return 0;
  return state.pallets.reduce((sum, pallet) => sum + (Number(pallet.qty) || 0), 0);
}

function hasQtyMismatch() {
  return state?.header?.totalQtyCases != null && state.header.totalQtyCases !== caseTotal();
}

function extraOrderCount() {
  return state?.header?.extraOrders?.length || 0;
}

function missingFields() {
  const missing = [];
  if (!isFilledText(els.orderRef.value)) missing.push("order reference");
  if (!isFilledText(els.supplierId.value)) missing.push("supplier ID");
  if (!isFilledText(els.supplierReference.value)) missing.push("supplier reference");
  if (!isFilledEmail(els.confirmEmail.value)) missing.push("confirmation email");
  if (!isFilledEmail(els.warehouseEmail.value)) missing.push("warehouse email");
  if (!els.deliveryDate.value) missing.push("delivery date");
  if (!state?.pallets.length) return missing;
  const emptyItem = state.pallets.filter((pallet) => !isFilledText(pallet.itemNr)).length;
  if (emptyItem) missing.push(`${emptyItem} item`);
  const emptyLot = state.pallets.filter((pallet) => !isFilledText(pallet.pallNo)).length;
  if (emptyLot) missing.push(`${emptyLot} lot`);
  const badQty = state.pallets.filter((pallet) => !isPositiveQty(pallet.qty)).length;
  if (badQty) missing.push(`${badQty} qty`);
  const emptyBbd = state.pallets.filter((pallet) => !isCompleteBbd(pallet.bbd)).length;
  if (emptyBbd) missing.push(`${emptyBbd} BBD`);
  return missing;
}

function updateDownloadState() {
  const missing = missingFields();
  const ready = Boolean(state?.pallets.length && missing.length === 0);
  els.downloadBtn.disabled = !ready;
  els.downloadBtn.title = ready
    ? "Download xlsx"
    : missing.length
      ? `Missing: ${missing.join(", ")}`
      : "Load a PDF first";
}

function uniqueItems(pallets) {
  const map = new Map();
  for (const pallet of pallets) {
    if (!map.has(pallet.itemNr)) {
      map.set(pallet.itemNr, {
        itemNr: pallet.itemNr,
        text: pallet.text,
        count: 0,
        bbd: "",
      });
    }
    map.get(pallet.itemNr).count += 1;
  }
  return [...map.values()];
}

function refreshItems() {
  const bbdByItem = new Map(state.items.map((item) => [item.itemNr, item.bbd]));
  state.items = uniqueItems(state.pallets).map((item) => ({
    ...item,
    bbd: bbdByItem.get(item.itemNr) || "",
  }));
}

function applyItemBbd(itemNr, bbd) {
  const item = state.items.find((entry) => entry.itemNr === itemNr);
  if (item) item.bbd = bbd;
  for (const pallet of state.pallets) {
    if (pallet.itemNr === itemNr && !pallet.bbdOverridden) {
      pallet.bbd = bbd;
    }
  }
}

function render() {
  if (!state) {
    els.summary.hidden = true;
    els.itemsSection.hidden = true;
    els.palletsSection.hidden = true;
    updateDownloadState();
    markInvalidInputs();
    return;
  }

  const { pallets, items } = state;
  const totalCases = caseTotal();
  const qtyMismatch = hasQtyMismatch();
  const vendors = [...new Set(pallets.map((pallet) => pallet.vendor))];
  const missing = missingFields();
  const extras = extraOrderCount();
  const orderLabel = els.orderRef.value.trim() || state.header?.orderRef || "—";

  els.summary.hidden = false;
  els.summary.innerHTML = [
    chip("Order", orderLabel),
    extras
      ? chip(`Using order ${orderLabel}; ignored ${extras} extra`, null, true)
      : "",
    chip("Supplier", vendors.join(", ") || "—"),
    chip("Supplier ID", els.supplierId.value.trim() || "—"),
    chip("Supplier ref", els.supplierReference.value.trim() || "—"),
    chip("Stock type", activeProfile.defaults.stockType || "—"),
    chip("On stock", pallets[0]?.onStock || "—"),
    chip("Delivery", els.deliveryDate.value || "—"),
    chip("Pallets", String(pallets.length)),
    chip("Cases", String(totalCases)),
    qtyMismatch
      ? chip(
          `Case sum ${totalCases} does not match PDF total ${state.header?.totalQtyCases}`,
          null,
          true
        )
      : "",
    missing.length ? chip(`Missing: ${missing.join(", ")}`, null, true) : "",
  ].join("");

  els.itemsSection.hidden = false;
  els.palletsSection.hidden = false;
  updateDownloadState();

  els.itemBody.innerHTML = items
    .map(
      (item) => `
      <tr data-item="${escapeAttr(item.itemNr)}">
        <td class="num">${escapeHtml(item.itemNr)}</td>
        <td>${escapeHtml(item.text)}</td>
        <td class="num">${item.count}</td>
        <td>
          <input class="bbd item-bbd" inputmode="numeric" placeholder="DD-MM-YYYY" maxlength="10" value="${escapeAttr(item.bbd)}" />
        </td>
      </tr>`
    )
    .join("");

  els.palletBody.innerHTML = pallets
    .map(
      (pallet, index) => `
      <tr data-index="${index}">
        <td class="num">
          <input class="lot-input" inputmode="numeric" value="${escapeAttr(pallet.pallNo)}" />
        </td>
        <td class="num">
          <input class="item-input" inputmode="numeric" value="${escapeAttr(pallet.itemNr)}" />
        </td>
        <td class="num">
          <input class="qty-input" inputmode="numeric" value="${escapeAttr(String(pallet.qty))}" />
        </td>
        <td>
          <input class="bbd lot-bbd" inputmode="numeric" placeholder="DD-MM-YYYY" maxlength="10" value="${escapeAttr(pallet.bbd)}" />
          ${pallet.bbdOverridden ? '<span class="badge">override</span>' : ""}
        </td>
        <td>
          <button type="button" class="btn ghost clear-override" ${pallet.bbdOverridden ? "" : "disabled"}>Clear</button>
        </td>
      </tr>`
    )
    .join("");

  markInvalidInputs();
}

function chip(label, value, warn = false) {
  const text = value == null ? label : `${label}: ${value}`;
  return `<span class="chip${warn ? " warn" : ""}">${escapeHtml(text)}</span>`;
}

function markInvalidInputs() {
  const loaded = Boolean(state?.pallets.length);
  els.orderRef.classList.toggle("invalid", loaded && !isFilledText(els.orderRef.value));
  els.supplierId.classList.toggle("invalid", loaded && !isFilledText(els.supplierId.value));
  els.supplierReference.classList.toggle(
    "invalid",
    loaded && !isFilledText(els.supplierReference.value)
  );
  els.confirmEmail.classList.toggle("invalid", loaded && !isFilledEmail(els.confirmEmail.value));
  els.warehouseEmail.classList.toggle("invalid", loaded && !isFilledEmail(els.warehouseEmail.value));
  els.deliveryDate.classList.toggle("invalid", loaded && !els.deliveryDate.value);
  document.querySelectorAll("input.bbd").forEach((input) => {
    input.classList.toggle("invalid", loaded && !isCompleteBbd(input.value.trim()));
  });
  document.querySelectorAll("input.item-input").forEach((input) => {
    input.classList.toggle("invalid", loaded && !isFilledText(input.value));
  });
  document.querySelectorAll("input.lot-input").forEach((input) => {
    input.classList.toggle("invalid", loaded && !isFilledText(input.value));
  });
  document.querySelectorAll("input.qty-input").forEach((input) => {
    input.classList.toggle("invalid", loaded && !isPositiveQty(input.value));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function isPdfFile(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type === "application/pdf" || type === "application/x-pdf") return true;
  if (type && type !== "application/octet-stream") return false;
  return /\.pdf$/i.test(file?.name || "");
}

function mapLoadError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  if (name === "PasswordException" || /password/i.test(message)) {
    return "This PDF is password-protected.";
  }
  if (
    name === "InvalidPDFException" ||
    name === "UnexpectedResponseException" ||
    /invalid pdf/i.test(message) ||
    /not a readable pdf/i.test(message)
  ) {
    return "Not a readable PDF.";
  }
  return message || "Could not read this PDF.";
}

async function loadPdf(file) {
  if (!isPdfFile(file)) {
    state = null;
    render();
    showStatus("Not a PDF.");
    return;
  }

  showStatus("Reading PDF…");
  els.downloadBtn.disabled = true;
  try {
    const parsed = await activeProfile.parsePdf(await file.arrayBuffer());
    if (!parsed.pallets.length) {
      state = null;
      render();
      showStatus("No pallet lines found for this source.");
      return;
    }

    state = {
      ...parsed,
      items: uniqueItems(parsed.pallets),
      pallets: parsed.pallets.map((pallet) => ({
        ...pallet,
        bbd: "",
        bbdOverridden: false,
        qty: pallet.crtPerPall ?? 0,
      })),
    };

    els.orderRef.value = parsed.header.orderRef || "";

    const extraCount = parsed.header.extraOrders?.length || 0;
    const extraOrdersNote = extraCount ? ` Using first order; ignored ${extraCount} extra.` : "";
    const extra =
      parsed.qtyMismatch && parsed.header.totalQtyCases != null
        ? ` Case sum ${parsed.totalCases} does not match PDF total ${parsed.header.totalQtyCases}.`
        : "";
    showStatus(
      `Loaded ${parsed.pallets.length} pallets, order ${parsed.header.orderRef || "—"}.${extraOrdersNote}${extra}`,
      !parsed.qtyMismatch && extraCount === 0
    );
    render();
  } catch (error) {
    state = null;
    render();
    showStatus(mapLoadError(error));
  }
}

els.dropzone.addEventListener("click", () => els.fileInput.click());
els.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.fileInput.click();
  }
});
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files[0];
  if (file) loadPdf(file);
});

["dragenter", "dragover"].forEach((type) => {
  els.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((type) => {
  els.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("dragover");
  });
});
els.dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (file) loadPdf(file);
});

els.itemBody.addEventListener("input", (event) => {
  const input = event.target.closest(".item-bbd");
  if (!input || !state) return;
  const itemNr = input.closest("tr").dataset.item;
  const formatted = formatBbd(input.value);
  if (formatted !== input.value) input.value = formatted;
  applyItemBbd(itemNr, formatted);
  renderKeepFocus(input, () =>
    els.itemBody.querySelector(`tr[data-item="${cssEscape(itemNr)}"] .item-bbd`)
  );
});

els.palletBody.addEventListener("input", (event) => {
  const input = event.target.closest(".lot-bbd");
  if (!input || !state) return;
  const index = Number(input.closest("tr").dataset.index);
  const formatted = formatBbd(input.value);
  if (formatted !== input.value) input.value = formatted;
  state.pallets[index].bbd = formatted;
  state.pallets[index].bbdOverridden = true;
  renderKeepFocus(input, () =>
    els.palletBody.querySelector(`tr[data-index="${index}"] .lot-bbd`)
  );
});

els.palletBody.addEventListener("input", (event) => {
  const input = event.target.closest(".qty-input");
  if (!input || !state) return;
  const index = Number(input.closest("tr").dataset.index);
  const digits = String(input.value || "").replace(/\D/g, "");
  const value = digits === "" ? 0 : Math.max(0, Math.trunc(Number(digits)));
  state.pallets[index].qty = value;
  renderKeepFocus(input, () =>
    els.palletBody.querySelector(`tr[data-index="${index}"] .qty-input`)
  );
});

els.palletBody.addEventListener("input", (event) => {
  const input = event.target.closest(".lot-input");
  if (!input || !state) return;
  const index = Number(input.closest("tr").dataset.index);
  state.pallets[index].pallNo = input.value;
  renderKeepFocus(input, () =>
    els.palletBody.querySelector(`tr[data-index="${index}"] .lot-input`)
  );
});

els.palletBody.addEventListener("input", (event) => {
  const input = event.target.closest(".item-input");
  if (!input || !state) return;
  const index = Number(input.closest("tr").dataset.index);
  const pallet = state.pallets[index];
  pallet.itemNr = input.value;
  refreshItems();
  if (!pallet.bbdOverridden) {
    const item = state.items.find((entry) => entry.itemNr === pallet.itemNr);
    pallet.bbd = item?.bbd || pallet.bbd;
  }
  renderKeepFocus(input, () =>
    els.palletBody.querySelector(`tr[data-index="${index}"] .item-input`)
  );
});

els.palletBody.addEventListener("click", (event) => {
  const button = event.target.closest(".clear-override");
  if (!button || !state || button.disabled) return;
  const index = Number(button.closest("tr").dataset.index);
  const pallet = state.pallets[index];
  pallet.bbdOverridden = false;
  const item = state.items.find((entry) => entry.itemNr === pallet.itemNr);
  pallet.bbd = item?.bbd || "";
  render();
});

els.downloadBtn.addEventListener("click", async () => {
  if (!state) return;
  const missing = missingFields();
  if (missing.length) {
    updateDownloadState();
    markInvalidInputs();
    showStatus(`Fill missing fields: ${missing.join(", ")}.`);
    return;
  }
  els.downloadBtn.disabled = true;
  try {
    state.orderRef = els.orderRef.value.trim();
    state.supplierId = els.supplierId.value.trim();
    state.supplierReference = els.supplierReference.value.trim();
    state.confirmationEmail = els.confirmEmail.value.trim();
    state.warehouseEmail = els.warehouseEmail.value.trim();
    state.deliveryDate = els.deliveryDate.value;
    state.stockType = activeProfile.defaults.stockType || "";
    state.pallets.forEach((pallet) => {
      pallet.itemNr = String(pallet.itemNr || "").trim();
      pallet.pallNo = String(pallet.pallNo || "").trim();
    });
    const name = await downloadInboundXlsx(state);
    showStatus(`Downloaded ${name}.`, true);
  } catch (error) {
    showStatus(error.message || String(error));
  } finally {
    updateDownloadState();
  }
});

[
  els.orderRef,
  els.supplierId,
  els.supplierReference,
  els.confirmEmail,
  els.warehouseEmail,
  els.deliveryDate,
].forEach((input) => {
  input.addEventListener("input", () => {
    if (!state) return;
    updateDownloadState();
    markInvalidInputs();
    render();
  });
});

function renderKeepFocus(input, nextInput) {
  let start = null;
  let end = null;
  try {
    start = input.selectionStart;
    end = input.selectionEnd;
  } catch {
    start = null;
  }
  render();
  const restored = nextInput();
  if (!restored) return;
  restored.focus();
  if (typeof start !== "number" || typeof restored.setSelectionRange !== "function") return;
  try {
    restored.setSelectionRange(start, end);
  } catch {
    // Number-like inputs in some browsers still reject selection APIs.
  }
}

els.sourceSelect.addEventListener("change", () => {
  activeProfile = getProfile(els.sourceSelect.value);
  writeStoredSource(activeProfile.id);
  applyProfileDefaults();
  clearLoadedPdf();
});

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

populateSourceSelect();
applyProfileDefaults();
updateDownloadState();
