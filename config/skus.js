// Developer-edited SKU catalog. NOT touched by the app at runtime.
// widthMm/heightMm define the true print dimensions and drive the live
// preview's aspect ratio. cornerRadiusMm is optional (used for a soft
// rounded-corner preview treatment matching the physical laptop skin).
//
// To add a real SKU later: append an object below and drop nothing else -
// SKUs have no other assets (designs are matched at customize time).
module.exports = [
  {
    id: "omnibook-5",
    familyName: "OmniBook 5",
    widthMm: 312,
    heightMm: 220,
    cornerRadiusMm: 8
  },
  {
    id: "omnibook-7",
    familyName: "OmniBook 7",
    widthMm: 336,
    heightMm: 232,
    cornerRadiusMm: 8
  },
  {
    id: "pavilion-14",
    familyName: "Pavilion 14",
    widthMm: 320,
    heightMm: 215,
    cornerRadiusMm: 6
  },
  {
    id: "pavilion-16",
    familyName: "Pavilion 16",
    widthMm: 358,
    heightMm: 245,
    cornerRadiusMm: 6
  }
];
