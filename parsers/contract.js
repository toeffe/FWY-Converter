/**
 * Inbound parse contract — WMS rows, not any source’s PDF layout.
 *
 * Each Source profile supplies its own parsePdf(arrayBuffer). That function
 * may read any PDF (headers, columns, one-row vs many, SSCC as lot, pieces vs
 * cases). Do not import parsers/fwy.js or assume FWY ORDER / PALL. No. / Crt.
 *
 * Shared helpers allowed: parsers/pdf.js (pdf.js text clustering only).
 *
 * parsePdf must resolve to:
 *
 * {
 *   header: { orderRef: string },
 *   pallets: [{
 *     vendor: string,      // Supplier Name
 *     itemNr: string,      // Item
 *     pallNo: string,      // Lot
 *     crtPerPall: number,  // Quantity
 *     text: string,        // UI label
 *     onStock?: string,    // optional UI chip
 *   }],
 *   totalCases: number,
 *   qtyMismatch: boolean,
 * }
 *
 * To add a source: parsers/<id>.js → register in profiles.js.
 */

export {};
