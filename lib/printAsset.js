// Converts the customer-facing RGB preview PNG into a print-ready CMYK
// PDF for the print provider. Browsers/Canvas/PNG are RGB-only - there is
// no way to produce CMYK on the client, so this conversion happens here,
// server-side, right before the order email is sent.
//
// Pipeline: sharp converts the RGB PNG to a CMYK JPEG, then pdfkit embeds
// that JPEG into a PDF page sized to the SKU's true physical dimensions.
//
// --- Why the JPEG is negated and embedded manually (not via doc.image())
// --------------------------------------------------------------------
// libvips (sharp's underlying engine) writes CMYK JPEG sample bytes in
// *inverted* polarity (an artifact of how libjpeg's CMYK path works) -
// so a byte of 0 means "full ink" and 255 means "no ink" for each
// channel, the opposite of what DeviceCMYK normally means. pdfkit's own
// `doc.image()` compensates for this: for any DeviceCMYK JPEG it
// unconditionally adds `/Decode [1 0 1 0 1 0 1 0]` to the image
// XObject, which un-inverts the samples per the *PDF spec*. Verified
// this is internally self-consistent (a pure-red source round-trips to
// the correct CMYK values) using a real PDF-spec-compliant renderer
// (MuPDF via PyMuPDF).
//
// The problem: that fix only works for readers that actually honor a
// PDF's per-image /Decode array. In production, order PDFs built this
// way opened with **inverted colors in both Photoshop and CorelDraw** -
// both apparently trust an embedded CMYK JPEG's raw sample bytes as
// literal ink values (the convention professional CMYK-JPEG workflows
// generally follow) rather than cross-referencing the PDF's own Decode
// array, so libvips' inverted-polarity bytes came through as-is: a
// visual negative.
//
// The fix here does the inversion once, before compression (sharp's
// `.negate()` on the CMYK data), so the JPEG's stored bytes are already
// *directly* correct - byte value IS the ink percentage, no inversion
// convention involved anywhere. That's then embedded with NO /Decode
// array at all (bypassing pdfkit's `doc.image()`, which cannot be told
// to omit it - see CmykJpegImage below), relying on DeviceCMYK's default
// identity decode. A file built this way needs no inversion convention
// to agree on: verified this still round-trips correctly under
// MuPDF (same as before - negate() and the removed Decode array cancel
// out mathematically for spec-honoring readers) while also fixing the
// literal-bytes-as-CMYK reading Photoshop/CorelDraw were apparently
// doing.
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

// A minimal pdfkit-compatible "image" (matches the interface pdfkit's
// own JPEG class exposes - width/height/label/orientation/embed()) so
// doc.image() can place it normally, but embed() here deliberately omits
// the /Decode array that pdfkit's built-in JPEG class always adds for
// DeviceCMYK images - see the file header for why.
class CmykJpegImage {
  constructor(data, width, height, label) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.label = label;
    this.orientation = 1; // no EXIF rotation to account for - we control the source
    this.obj = null;
  }
  embed(document) {
    if (this.obj) return;
    this.obj = document.ref({
      Type: "XObject",
      Subtype: "Image",
      BitsPerComponent: 8,
      Width: this.width,
      Height: this.height,
      ColorSpace: "DeviceCMYK",
      Filter: "DCTDecode"
    });
    this.obj.end(this.data);
    this.data = null;
  }
}

// pngBuffer: Buffer of the RGB preview PNG (may have transparency).
// widthMm/heightMm: the SKU's true physical print dimensions - the PDF
// page is sized to exactly match, so the print team can place it 1:1.
// Returns a Promise<Buffer> of the finished single-page PDF.
async function buildCmykPdf({ pngBuffer, widthMm, heightMm }) {
  const cmykJpegBuffer = await sharp(pngBuffer)
    .flatten({ background: "#ffffff" }) // JPEG has no alpha channel
    .toColourspace("cmyk")
    .negate() // cancels libvips' inverted-polarity CMYK JPEG output - see file header
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const { width, height } = await sharp(cmykJpegBuffer).metadata();

  const widthPt = widthMm * MM_TO_PT;
  const heightPt = heightMm * MM_TO_PT;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [widthPt, heightPt], margin: 0 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const image = new CmykJpegImage(cmykJpegBuffer, width, height, "CmykArt");
    doc.image(image, 0, 0, { width: widthPt, height: heightPt });
    doc.end();
  });
}

module.exports = { buildCmykPdf };
