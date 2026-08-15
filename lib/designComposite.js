// Server-side compositing of the final print-ready PNG: the original
// design artwork (stored byte-for-byte, see designsStore.js) plus the
// customer's initials/text, rendered once at print resolution.
//
// This replaces rasterizing the final export in the browser via
// <canvas>, which downsampled every design to a fixed low density
// (PX_PER_MM = 5, ~127 DPI) regardless of the source artwork's actual
// resolution - the email and the print-ready CMYK PDF (see printAsset.js)
// were both built from that already-degraded image. Compositing here
// instead means: vector (SVG) artwork rasterizes losslessly at print
// resolution, and raster (PNG) artwork is never scaled down below its
// own native detail.
//
// Text is measured with the exact same SVG/sharp rendering pipeline that
// draws the final output (render at a candidate size, measure the real
// rasterized ink via trim()), so "does this fit the zone" can never
// disagree with what actually gets painted - unlike estimating width
// from font metrics separately from the renderer that draws it.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ASSETS_DIR } = require("./designsStore");

const MM_TO_IN = 1 / 25.4;
const PRINT_DPI = 300;
const PRINT_PX_PER_MM = PRINT_DPI * MM_TO_IN; // ~11.81 px/mm
// Ceiling on raster output resolution - "never downscale below native"
// (see file header) intentionally preserves extra source detail, but
// with no upper bound a very high-resolution admin-uploaded design can
// balloon the composited PNG/CMYK PDF file size well past anything a
// print process can actually use, which is enough on its own to blow
// past email attachment size limits. 600 DPI (2x the print target) is
// already well beyond any visible print-quality benefit, so it's a safe
// ceiling that still keeps the "prefer native over downscale" behavior
// for any reasonably-sized upload.
const MAX_PRINT_PX_PER_MM = PRINT_PX_PER_MM * 2;

// Physical corner radius baked into the exported artwork, matching the
// kiosk's live-preview card styling (2mm) - expressed in mm rather than
// a fixed pixel count so it still reads as "gently rounded" regardless
// of the output resolution a given design/SKU ends up at.
const CORNER_RADIUS_MM = 2;

// Matches the width/height safety margins and font-size floor the
// kiosk's client-side export previously used (see the old
// renderFinalCanvas()/fitFontSize() in public/js/kiosk.js).
const ZONE_WIDTH_MARGIN = 0.94;
const ZONE_HEIGHT_MARGIN = 0.85;
const FONT_SIZE_FLOOR = 3;
const MAX_FIT_ITERATIONS = 24;

// "Inter" first in case a deployment environment happens to have it
// installed via system fontconfig, falling back to widely-available
// sans-serifs otherwise - keeps the print output legible and close in
// spirit to the live preview's font even where the exact family isn't
// resolvable server-side.
const FONT_STACK = '"Inter", "Liberation Sans", "DejaVu Sans", sans-serif';

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  }[c]));
}

function isSvgAsset(assetPath) {
  return path.extname(String(assetPath || "")).toLowerCase() === ".svg";
}

// Renders `text` as a single line at `fontSize` and returns the actual
// rasterized ink's bounding box (trim() crops away the transparent
// margin), which is what the shrink-to-fit search below measures against.
// The probe canvas is sized generously relative to the text/font size
// (not a fixed large constant) - a probe canvas that's too big makes
// every single measurement rasterize and trim a huge, mostly-blank
// image, which is the difference between this taking milliseconds and
// this taking tens of seconds per order.
async function measureText(text, fontSize) {
  const probeW = Math.max(Math.round(fontSize * (text.length + 1) * 1.2), Math.round(fontSize * 4));
  const probeH = Math.round(fontSize * 2);
  const svg = `<svg width="${probeW}" height="${probeH}" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="${Math.round(fontSize * 1.2)}" font-size="${fontSize}" font-family='${FONT_STACK}' font-weight="700">${escapeXml(text)}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}

// Mirrors the client's old fitFontSize(): shrink the font until the
// rendered text fits within maxWidth, starting from maxStartSize and
// never going below FONT_SIZE_FLOOR. Rendered width is monotonically
// non-decreasing in font size, so a binary search finds the exact same
// answer a linear 1px-at-a-time decrement would, in a handful of render
// calls instead of potentially hundreds.
async function fitFontSize(text, maxWidth, maxStartSize) {
  const safeText = text && text.length > 0 ? text : "M";
  const startSize = Math.max(Math.round(maxStartSize), FONT_SIZE_FLOOR);

  const atStart = await measureText(safeText, startSize);
  if (atStart.width <= maxWidth) return startSize;

  let lo = FONT_SIZE_FLOOR;
  let hi = startSize - 1;
  let best = FONT_SIZE_FLOOR; // matches the client's behavior of settling at the floor if nothing fits
  let iterations = 0;
  while (lo <= hi && iterations < MAX_FIT_ITERATIONS) {
    const mid = Math.floor((lo + hi) / 2);
    const m = await measureText(safeText, mid);
    if (m.width <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
    iterations += 1;
  }
  return best;
}

// Reads a design asset's own intrinsic aspect ratio (width/height). Works
// for both SVG (sharp reads it from the viewBox/width/height attributes)
// and PNG. Needed both here (to compute the cover-crop window below) and
// by routes/kiosk.js's GET /designs, which exposes it to the client so
// the live preview can replicate the exact same crop math - see
// public/js/kiosk.js's computeCoverCropWindow/mapZoneToVisibleSpace,
// which must be kept in sync with the two functions below by hand, since
// the browser has no access to this Node module.
async function getAssetAspect(assetBuffer) {
  const meta = await sharp(assetBuffer).metadata();
  return meta.width / meta.height;
}

// Lightweight variant for callers (routes/kiosk.js's GET /designs) that
// only need the aspect ratio, not the asset's bytes - hands sharp the file
// path directly instead of buffering the whole file into memory first
// just to read its header and throw the bytes away. Matters at catalog
// scale: that endpoint computes this for every design on every kiosk
// visit, in parallel, so an admin-uploaded design near the 5MB upload cap
// otherwise means every visitor briefly holds it (and everything else in
// the catalog) fully in memory for no reason.
async function getAssetAspectFromFile(filePath) {
  const meta = await sharp(filePath).metadata();
  return meta.width / meta.height;
}

// A design's zone (xPct/yPct/widthPct/heightPct) is authored as a
// percentage of the ORIGINAL artwork, not of whatever's actually visible
// after cover-cropping it to a given SKU's aspect ratio - otherwise the
// same design shows its customization text in a visually different spot
// on the artwork depending on which SKU happens to be selected (every
// laptop SKU has a different physical aspect ratio, so the crop differs
// per SKU even though the zone's raw numbers never change). This
// computes the sub-rectangle of the original artwork (in 0-100 percent
// terms) that stays visible after a centered "cover" crop to
// targetAspect, so a zone can be re-expressed against that visible
// window instead of the artwork's full frame.
function computeCoverCropWindow(assetAspect, targetAspect) {
  if (assetAspect >= targetAspect) {
    // Artwork is relatively wider than the target - full height stays
    // visible, left/right get cropped evenly.
    const visibleWidthPct = (targetAspect / assetAspect) * 100;
    return {
      offsetXPct: (100 - visibleWidthPct) / 2,
      offsetYPct: 0,
      visibleWidthPct,
      visibleHeightPct: 100
    };
  }
  // Artwork is relatively taller than the target - full width stays
  // visible, top/bottom get cropped evenly.
  const visibleHeightPct = (assetAspect / targetAspect) * 100;
  return {
    offsetXPct: 0,
    offsetYPct: (100 - visibleHeightPct) / 2,
    visibleWidthPct: 100,
    visibleHeightPct
  };
}

// Re-expresses a zone (defined against the original artwork) as a
// percentage of the visible/cropped canvas - what the rest of this file
// (and the client-side preview) actually needs to position against. A
// zone positioned close enough to an edge can fall partially or fully
// outside the visible window for some SKU aspect ratios; that's clamped
// back into [0, 100] rather than left to render off-canvas or throw, and
// logged so it's noticeable rather than silently wrong.
function mapZoneToVisibleSpace(zone, cropWindow, { referenceId } = {}) {
  const { offsetXPct, offsetYPct, visibleWidthPct, visibleHeightPct } = cropWindow;
  let xPct = ((zone.xPct - offsetXPct) / visibleWidthPct) * 100;
  let yPct = ((zone.yPct - offsetYPct) / visibleHeightPct) * 100;
  let widthPct = (zone.widthPct / visibleWidthPct) * 100;
  let heightPct = (zone.heightPct / visibleHeightPct) * 100;

  const clampedXPct = Math.min(Math.max(xPct, 0), 100);
  const clampedYPct = Math.min(Math.max(yPct, 0), 100);
  const clampedWidthPct = Math.min(Math.max(widthPct, 0), 100 - clampedXPct);
  const clampedHeightPct = Math.min(Math.max(heightPct, 0), 100 - clampedYPct);

  if (clampedXPct !== xPct || clampedYPct !== yPct || clampedWidthPct !== widthPct || clampedHeightPct !== heightPct) {
    console.error(
      `[designComposite]${referenceId ? ` [order ${referenceId}]` : ""} zone falls outside this SKU's visible crop and was clamped - the design's zone position needs adjusting for this aspect ratio.`
    );
  }

  return { xPct: clampedXPct, yPct: clampedYPct, widthPct: clampedWidthPct, heightPct: clampedHeightPct };
}

// Computes the output canvas size for a given design asset + SKU: vector
// art rasterizes losslessly at print resolution; raster art is never
// downscaled below whatever its own native pixels support under a
// "cover" crop to the SKU's aspect ratio (only upscaled to the 300 DPI
// floor if the source is lower-res than that).
async function computeOutputSize({ assetBuffer, isSvg, assetAspect, skuWidthMm, skuHeightMm }) {
  const skuAspect = skuWidthMm / skuHeightMm;
  const printW = Math.round(skuWidthMm * PRINT_PX_PER_MM);
  const printH = Math.round(skuHeightMm * PRINT_PX_PER_MM);

  if (isSvg) {
    return { width: printW, height: printH };
  }

  const meta = await sharp(assetBuffer).metadata();
  let nativeCoverW;
  if (assetAspect > skuAspect) {
    nativeCoverW = Math.round(meta.height * skuAspect);
  } else {
    nativeCoverW = meta.width;
  }

  const maxW = Math.round(skuWidthMm * MAX_PRINT_PX_PER_MM);
  const width = Math.min(Math.max(printW, nativeCoverW), maxW);
  const height = Math.round(width / skuAspect);
  return { width, height };
}

// design: the raw record from designsStore (assetPath + zone).
// sku: { widthMm, heightMm } (the shaped SKU is fine - only these two fields are used).
// initials: already validated/sanitized customization text.
// referenceId: optional, only used to make the "zone was clamped" log
// line (see mapZoneToVisibleSpace) traceable to the order that hit it.
// Returns a Promise<Buffer> of the finished RGBA PNG.
async function compositeDesignPng({ design, sku, initials, referenceId }) {
  const assetFile = path.join(ASSETS_DIR, path.basename(design.assetPath));
  const assetBuffer = fs.readFileSync(assetFile);
  const isSvg = isSvgAsset(design.assetPath);
  const assetAspect = await getAssetAspect(assetBuffer);
  const skuAspect = sku.widthMm / sku.heightMm;

  const { width, height } = await computeOutputSize({
    assetBuffer,
    isSvg,
    assetAspect,
    skuWidthMm: sku.widthMm,
    skuHeightMm: sku.heightMm
  });

  // The design's zone is authored against the original artwork's own
  // frame (see mapZoneToVisibleSpace above) - re-express it against
  // whatever's actually visible on this SKU's cover-cropped canvas
  // before using it for any pixel math below.
  const cropWindow = computeCoverCropWindow(assetAspect, skuAspect);
  const zone = { ...design.zone, ...mapZoneToVisibleSpace(design.zone, cropWindow, { referenceId }) };

  // Base artwork, cover-cropped to the SKU's aspect ratio at the chosen
  // resolution. sharp re-rasterizes vector input at the target size
  // directly rather than rasterizing small and resizing up, so SVG
  // assets lose nothing here either.
  const baseLayer = await sharp(assetBuffer)
    .resize(width, height, { fit: "cover", kernel: "lanczos3" })
    .ensureAlpha()
    .toBuffer();

  // Rounded-corner mask, applied via a "dest-in" composite so the area
  // outside the rounded rect stays fully transparent - matching the old
  // canvas export's ctx.clip() behavior (the corners were never filled).
  const radiusPx = Math.max(1, Math.round(CORNER_RADIUS_MM * (width / sku.widthMm)));
  const maskSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radiusPx}" ry="${radiusPx}" fill="#fff"/>
  </svg>`;
  const maskBuffer = await sharp(Buffer.from(maskSvg)).png().toBuffer();

  const zw = Math.max(1, (zone.widthPct / 100) * width);
  const zh = Math.max(1, (zone.heightPct / 100) * height);

  const fontSize = await fitFontSize(initials, zw * ZONE_WIDTH_MARGIN, zh * ZONE_HEIGHT_MARGIN);

  const anchor = zone.align === "left" ? "start" : zone.align === "right" ? "end" : "middle";
  const textX = zone.align === "left" ? 0 : zone.align === "right" ? zw : zw / 2;
  // The <text> layer is its own SVG sized exactly to the zone box - SVG's
  // default overflow:hidden on the root element clips anything outside
  // it, which reproduces the old ctx.clip()-to-zone-rect behavior without
  // needing a separate clip path.
  const textW = Math.min(width, Math.round(zw));
  const textH = Math.min(height, Math.round(zh));
  const textSvg = `<svg width="${textW}" height="${textH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${textX}" y="${zh / 2}" font-size="${fontSize}" font-family='${FONT_STACK}' font-weight="700"
          fill="${escapeXml(zone.color)}" text-anchor="${anchor}" dominant-baseline="central">${escapeXml(initials)}</text>
  </svg>`;
  const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

  // Independently-rounded left/zone width can push left+width a pixel
  // past the base canvas - sharp's composite() throws if an overlay
  // (with explicit left/top) extends past the destination, so the
  // placement is clamped rather than trusting the rounding to land
  // exactly in bounds.
  const left = Math.min(Math.round((zone.xPct / 100) * width), width - textW);
  const top = Math.min(Math.round((zone.yPct / 100) * height), height - textH);

  return sharp(baseLayer)
    .composite([
      { input: maskBuffer, blend: "dest-in" },
      { input: textBuffer, left: Math.max(0, left), top: Math.max(0, top) }
    ])
    .png()
    .toBuffer();
}

module.exports = { compositeDesignPng, getAssetAspect, getAssetAspectFromFile };
