// Customer-facing kiosk API. Anonymous by design: only store selection,
// SKU, design, initials, and a generated reference ID ever flow through
// here. No name/phone/email/personal data is accepted or logged.

const express = require("express");
const crypto = require("crypto");

const skus = require("../config/skus");
const designs = require("../config/designs");
const accentColors = require("../config/accentColors");
const motifs = require("../config/motifs");
const { readStores, findStoreById } = require("../lib/storesStore");
const { sanitizeInitials, isValidInitials } = require("../lib/validators");
const { sendSpecSheetEmail } = require("../lib/emailProvider");

const router = express.Router();

function generateReferenceId() {
  return "HP-SKIN-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

// Store picker: name only, no credentials, no print-provider data exposed.
router.get("/stores", (req, res) => {
  const stores = readStores().map((s) => ({ storeId: s.storeId, storeName: s.storeName }));
  res.json(stores);
});

router.get("/skus", (req, res) => {
  res.json(skus);
});

router.get("/designs", (req, res) => {
  res.json(designs);
});

router.get("/accent-colors", (req, res) => {
  res.json(accentColors);
});

router.get("/motifs", (req, res) => {
  res.json(motifs);
});

// Current kiosk session context (store-only "login" state).
router.get("/session", (req, res) => {
  if (!req.session.storeId) return res.json({ storeId: null, storeName: null });
  const store = findStoreById(req.session.storeId);
  res.json({ storeId: req.session.storeId, storeName: store ? store.storeName : null });
});

// Selecting a store is the kiosk's only "login" step - no credential check.
router.post("/session/store", (req, res) => {
  const { storeId } = req.body || {};
  const store = findStoreById(storeId);
  if (!store) {
    return res.status(400).json({ error: "Unknown store" });
  }
  req.session.storeId = store.storeId;
  res.json({ storeId: store.storeId, storeName: store.storeName });
});

// Lets kiosk staff switch stores without restarting the whole app.
router.post("/session/reset-store", (req, res) => {
  req.session.storeId = null;
  res.json({ ok: true });
});

router.post("/submit", async (req, res) => {
  const storeId = req.session.storeId;
  if (!storeId) {
    return res.status(400).json({ error: "No store selected for this session" });
  }
  const store = findStoreById(storeId);
  if (!store) {
    return res.status(400).json({ error: "Selected store no longer exists" });
  }

  const { skuId, designId, accentId, motifId, previewPng } = req.body || {};
  const initials = sanitizeInitials(req.body && req.body.initials);

  const sku = skus.find((s) => s.id === skuId);
  const design = designs.find((d) => d.id === designId);
  const accent = accentColors.find((a) => a.id === accentId);
  const motif = motifs.find((m) => m.id === motifId);

  if (!sku) return res.status(400).json({ error: "Invalid SKU" });
  if (!design) return res.status(400).json({ error: "Invalid design" });
  if (!accent) return res.status(400).json({ error: "Invalid accent colour" });
  if (!motif) return res.status(400).json({ error: "Invalid motif" });
  if (!isValidInitials(initials)) {
    return res.status(400).json({ error: "Initials must be 1-3 letters" });
  }
  if (!previewPng || typeof previewPng !== "string" || !previewPng.startsWith("data:image/png;base64,")) {
    return res.status(400).json({ error: "Missing or invalid preview image" });
  }

  const previewPngBuffer = Buffer.from(previewPng.split(",")[1], "base64");
  const referenceId = generateReferenceId();
  const timestamp = new Date().toISOString();

  const specSheet = {
    designId: design.id,
    designName: design.name,
    skuFamily: sku.familyName,
    widthMm: sku.widthMm,
    heightMm: sku.heightMm,
    initials,
    accentName: accent.name,
    motifName: motif.name,
    storeName: store.storeName,
    region: store.region,
    printProviderName: store.printProviderName,
    referenceId,
    timestamp
  };

  try {
    await sendSpecSheetEmail({
      toAddresses: store.printProviderEmails,
      specSheet,
      previewPngBuffer
    });
  } catch (err) {
    console.error(`[submit] email send failed for ${referenceId}:`, err.message);
    return res.status(502).json({
      error: "We couldn't send your order to the print provider. Please try again or ask a store associate for help.",
      referenceId
    });
  }

  res.json({ referenceId, timestamp });
});

module.exports = router;
