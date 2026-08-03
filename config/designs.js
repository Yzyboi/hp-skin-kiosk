// Developer-edited design catalog. NOT touched by the app at runtime.
//
// assetPath is served statically from /public/designs/ and is the fixed
// base artwork (Electric Blue baked in) - it does not recolor with the
// selected Accent Colour, matching the reference prototype's own
// design-picker thumbnails (which always render at a fixed demo accent).
//
// zone is percentage-based (0-100, relative to the design's own bounding
// box) so the initials overlay lands in the right spot regardless of
// which SKU aspect ratio the design is rendered onto. align controls
// text anchoring within the zone rectangle. followsAccent: true means
// the initials text is tinted with the customer's chosen Accent Colour
// instead of the design's own fixedColor.
//
// motifZone is a second percentage rectangle where the selected Motif
// (see config/motifs.js) is drawn, tinted with the chosen Accent Colour.
//
// To add a real design later: drop the asset into public/designs/ and
// append an entry below with a zone/motifZone tuned to the artwork.
module.exports = [
  {
    id: "shear",
    name: "Shear",
    assetPath: "/designs/shear.svg",
    zone: { xPct: 55, yPct: 68, widthPct: 38, heightPct: 22, align: "center", followsAccent: true, fixedColor: "#0B4FD1" },
    motifZone: { xPct: 8, yPct: 8, widthPct: 30, heightPct: 20 }
  },
  {
    id: "halo",
    name: "Halo",
    assetPath: "/designs/halo.svg",
    zone: { xPct: 25, yPct: 38, widthPct: 50, heightPct: 24, align: "center", followsAccent: true, fixedColor: "#0B4FD1" },
    motifZone: { xPct: 6, yPct: 76, widthPct: 30, heightPct: 18 }
  },
  {
    id: "grid",
    name: "Grid",
    assetPath: "/designs/grid.svg",
    zone: { xPct: 6, yPct: 8, widthPct: 36, heightPct: 20, align: "left", followsAccent: true, fixedColor: "#0B4FD1" },
    motifZone: { xPct: 58, yPct: 70, widthPct: 36, heightPct: 20 }
  },
  {
    id: "fold",
    name: "Fold",
    assetPath: "/designs/fold.svg",
    zone: { xPct: 6, yPct: 62, widthPct: 34, heightPct: 22, align: "left", followsAccent: false, fixedColor: "#FFFFFF" },
    motifZone: { xPct: 58, yPct: 8, widthPct: 34, heightPct: 20 }
  }
];
