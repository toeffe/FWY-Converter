export function clusterTextItems(items, yTolerance = 3) {
  const usable = items.filter((item) => item.str && item.str.trim());
  const sorted = [...usable].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > yTolerance) return yDiff;
    return a.transform[4] - b.transform[4];
  });

  const lines = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const last = lines[lines.length - 1];
    const part = {
      x: item.transform[4],
      str: item.str,
      width: item.width || 0,
      height: item.height || 0,
    };
    if (!last || Math.abs(last.y - y) > yTolerance) {
      lines.push({ y, parts: [part] });
    } else {
      last.parts.push(part);
    }
  }

  return lines.map((line) => {
    const parts = [...line.parts].sort((a, b) => a.x - b.x);
    let text = "";
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (i === 0) {
        text = part.str;
        continue;
      }
      const prev = parts[i - 1];
      const gap = part.x - (prev.x + prev.width);
      const threshold = Math.max(1, 0.25 * (prev.height || part.height || 0));
      text += gap < threshold ? part.str : ` ${part.str}`;
    }
    return text.replace(/\s+/g, " ").trim();
  });
}

function mapPdfError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  if (name === "PasswordException" || /password/i.test(message)) {
    return new Error("This PDF is password-protected.");
  }
  if (
    name === "InvalidPDFException" ||
    name === "UnexpectedResponseException" ||
    /invalid pdf/i.test(message)
  ) {
    return new Error("Not a readable PDF.");
  }
  return error instanceof Error ? error : new Error(message || "Not a readable PDF.");
}

export async function extractPdfLines(arrayBuffer) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error("pdf.js failed to load.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const lines = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      lines.push(...clusterTextItems(content.items));
    }

    return lines;
  } catch (error) {
    throw mapPdfError(error);
  }
}
