/**
 * Layout-preserving PDF text extraction using pdfjs-dist (pure JS — no system
 * binary, so it works the same on Windows, Ubuntu and in the Docker image).
 *
 * Reconstructs a `pdftotext -layout`-style string: text items are grouped into
 * rows by their y-coordinate and placed at a column derived from x / median
 * glyph width, so the DDR's aligned tables survive as fixed-width columns the
 * parser can slice.
 */

// pdfjs-dist v3 ships a CJS "legacy" build that runs under Node. We load it
// lazily so importing this module never triggers the (browser-oriented) main
// build. The `canvas` optional dep is irrelevant to text extraction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfItem = { str: string; transform: number[]; width: number };

let pdfjsPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
function loadPdfjs(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!pdfjsPromise) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    pdfjsPromise = Promise.resolve(require('pdfjs-dist/legacy/build/pdf.js'));
  }
  return pdfjsPromise;
}

/** Extract the full document as layout-preserved text (one page after another). */
export async function pdfToLayoutText(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    // Silence the harmless "Cannot polyfill DOMMatrix" canvas warnings.
    verbosity: 0,
  }).promise;

  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: { str: string; x: number; y: number; w: number }[] = (
      content.items as PdfItem[]
    )
      .filter((i) => typeof i.str === 'string' && i.str.length > 0)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));

    if (items.length === 0) continue;

    // Median glyph width → the column unit (mirrors pdftotext -layout spacing).
    const glyphWidths = items
      .filter((i) => i.str.trim().length > 0)
      .map((i) => i.w / i.str.length)
      .filter((w) => w > 0)
      .sort((a, b) => a - b);
    const charW = glyphWidths.length ? glyphWidths[Math.floor(glyphWidths.length / 2)] : 5;

    // Group into visual rows by y (PDF y grows upward → sort descending).
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: typeof items }[] = [];
    let cur: { y: number; items: typeof items } | null = null;
    for (const it of sorted) {
      if (!cur || Math.abs(it.y - cur.y) > 3) {
        cur = { y: it.y, items: [] };
        rows.push(cur);
      }
      cur.items.push(it);
    }

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let line = '';
      for (const it of row.items) {
        const col = Math.max(0, Math.round(it.x / charW));
        if (col > line.length) line += ' '.repeat(col - line.length);
        line += it.str;
      }
      out.push(line.replace(/\s+$/, ''));
    }
    out.push(''); // page break (blank line)
  }
  return out.join('\n');
}
