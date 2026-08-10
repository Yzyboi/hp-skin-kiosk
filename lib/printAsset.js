// Converts the customer-facing RGB preview PNG into a print-ready CMYK
// PDF for the print provider. Browsers/Canvas/PNG are RGB-only - there is
// no way to produce CMYK on the client, so this conversion happens here,
// server-side, right before the order email is sent.
//
// Pipeline: sharp converts the RGB PNG to a CMYK JPEG (this is the
// documented way to get libvips to emit an Adobe-convention CMYK JPEG,
// complete with the APP14 marker that tells downstream readers the
// samples are inverted per Adobe's convention) - then pdfkit embeds that
// JPEG directly into a PDF page sized to the SKU's true physical
// dimensions. pdfkit detects the 4-component/Adobe-marked JPEG and embeds
// it as /ColorSpace /DeviceCMYK with the correct /Decode array, so the
// CMYK sample values are never round-tripped through RGB again - this was
// verified empirically (a pure-red source decodes to ~0% C / ~96% M /
// 100% Y / ~1% K in the resulting PDF, which is correct).
//
// --- Using a real print-provider ICC profile instead of the generic
// --- conversion --------------------------------------------------------
// Right now this uses libvips' built-in generic RGB->CMYK transform (no
// specific color profile), which is a reasonable placeholder but won't
// precisely match any particular press. Once you have an ICC profile
// from the print provider (e.g. their proofing profile, or a standard
// one like "U.S. Web Coated (SWOP) v2" if that's what they use):
//   1. Drop the .icc file in, e.g. config/color-profiles/print-cmyk.icc
//   2. Pass it to sharp: .toColourspace("cmyk", { icc: profilePath })
//      (or use sharp's .withMetadata({ icc: profilePath }) depending on
//      the sharp version - check the installed version's docs) so the
//      conversion is calibrated to that specific press instead of the
//      generic default.
// No other file needs to change - every caller only imports
// buildCmykPdf from this module.
// ------------------------------------------------------------------------

const sharp = require("sharp");
const PDFDocument = require("pdfkit");

const MM_TO_PT = 72 / 25.4; // PDF points are 1/72 inch; 1 inch = 25.4mm

// pngBuffer: Buffer of the RGB preview PNG (may have transparency).
// widthMm/heightMm: the SKU's true physical print dimensions - the PDF
// page is sized to exactly match, so the print team can place it 1:1.
// Returns a Promise<Buffer> of the finished single-page PDF.
async function buildCmykPdf({ pngBuffer, widthMm, heightMm }) {
  const cmykJpegBuffer = await sharp(pngBuffer)
    .flatten({ background: "#ffffff" }) // JPEG has no alpha channel
    .toColourspace("cmyk")
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const widthPt = widthMm * MM_TO_PT;
  const heightPt = heightMm * MM_TO_PT;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [widthPt, heightPt], margin: 0 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.image(cmykJpegBuffer, 0, 0, { width: widthPt, height: heightPt });
    doc.end();
  });
}

module.exports = { buildCmykPdf };
