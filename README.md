# Inbound converter

Turns an FWY arrival-notice PDF into an inbound Excel workbook in the browser.

The live site is [https://konverter.t-tek.dev](https://konverter.t-tek.dev). The same files can be copied to any static web server.

## Installation guide

Copy these files and keep the `parsers/` folder:

- `index.html`
- `styles.css`
- `app.js`
- `excel.js`
- `template.js`
- `profiles.js`
- `parsers/pdf.js`
- `parsers/fwy.js`
- `parsers/contract.js`

`parsers/fwy.test.mjs` and `CNAME` are not part of the running site. `CNAME` only names the current host.

There is no build step and no Node process. Serve the folder with a normal static web server and open it over HTTP or HTTPS. Opening `index.html` as a `file://` page fails, because the app uses ES modules.

Serve `.js` files as JavaScript (`text/javascript`).

The page also loads HTTPS scripts from CDNs. A plain HTTP host can block those scripts as mixed content. Serve the site over HTTPS.

## Browsers

Current Chrome, Edge, or Firefox, with JavaScript enabled.

## How to use

1. Open the page.
2. Choose the source. The only source today is FWY.
3. Drop an FWY arrival-notice PDF on the page, or click the drop zone and choose a file.
4. The order reference is filled from the first `FWY ORDER no.` when the PDF has one. You can edit it.
5. Fill in supplier ID, supplier reference, confirmation email, warehouse email, and delivery date. Delivery date starts as today and is shown as `DD-MM-YYYY`. Typing `DDMMYY` is accepted.
6. Under **BBD per item**, type a best-before date for each item. That date applies to every pallet of that item.
7. Under **Pallets / lots**, edit lot, item, qty, or BBD. A pallet BBD locks that row. **Clear** puts the item BBD back.
8. **Download xlsx** stays disabled until the fields above are valid. The file is named `{order reference}_inbound.xlsx`.

Stock type for FWY is `FFA`. That value is fixed in the profile. It is shown on the page and written into the workbook.

## Connectivity

After the page’s own files load, the browser requests only these library files:

- `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`
- `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
- `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`

pdf.js reads the PDF. ExcelJS fills an Excel template that ships inside the site files. The browser then downloads the workbook.

If either CDN is blocked or down, the page can still open. Reading a PDF or building the workbook fails.

## What leaves the browser

The PDF, form fields, pallet edits, and the xlsx stay in the browser. They are not sent to the host or to the CDNs.

The CDN requests fetch the library files only. Those requests do not include the document. The download is a local file.

## What the browser keeps

On that browser only, for this site, the page remembers:

- the last chosen source
- the confirmation email
- the warehouse email

The app does not store the PDF, order reference, supplier ID, supplier reference, delivery date, pallet rows, or the xlsx.

## Limits

- Only the first FWY order number is used. Extra numbers on that line are ignored and counted on screen.
- Best-before date is typed by hand. It is not read from the PDF.
- Password-protected PDFs are rejected.
- If the pallet case sum does not match `TOTAL QTY CASES` on the PDF, the page warns. That warning does not by itself block download.

## Adding a source

1. Add `parsers/<id>.js`.
2. Export `parsePdf(arrayBuffer)`. It must return the shape described in `parsers/contract.js`.
3. Add one entry to `profiles` in `profiles.js`.

## License

Copyright (c) 2026 [toeffe](https://github.com/toeffe). All rights reserved.
