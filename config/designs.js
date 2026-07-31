// Developer-edited design catalog. NOT touched by the app at runtime.
//
// assetPath is served statically from /public/designs/. Prefer SVG; accept
// high-res PNG if a design isn't available as vector art.
//
// zone is percentage-based (0-100, relative to the design's own bounding
// box) so the initials overlay lands in the right spot regardless of which
// SKU aspect ratio the design is rendered onto. align controls text
// anchoring within the zone rectangle.
//
// To add a real design later: drop the asset into public/designs/ and
// append an entry below with a zone tuned to where the initials should sit.
module.exports = [
  {
    id: "electric-wave",
    name: "Electric Wave",
    assetPath: "/designs/electric-wave.svg",
    zone: { xPct: 8, yPct: 62, widthPct: 40, heightPct: 26, align: "left" }
  },
  {
    id: "carbon-grid",
    name: "Carbon Grid",
    assetPath: "/designs/carbon-grid.svg",
    zone: { xPct: 30, yPct: 40, widthPct: 40, heightPct: 24, align: "center" }
  },
  {
    id: "aurora-fade",
    name: "Aurora Fade",
    assetPath: "/designs/aurora-fade.svg",
    zone: { xPct: 52, yPct: 66, widthPct: 40, heightPct: 26, align: "right" }
  },
  {
    id: "mono-dot",
    name: "Mono Dot",
    assetPath: "/designs/mono-dot.svg",
    zone: { xPct: 8, yPct: 8, widthPct: 40, heightPct: 24, align: "left" }
  }
];
