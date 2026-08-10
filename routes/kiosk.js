// Customer-facing kiosk API.
//
// NOTE: this used to be fully anonymous (no personal data captured or
// logged, per the original spec). It now captures customer name/phone/
// email/address on a dedicated screen after the design is finalized -
// see the Customer Info screen in public/js/kiosk.js. That data is
// included in the print-provider email and persisted via ordersStore so
// it's visible in the admin console's Orders view/export.

const express = require("express");
const crypto = require("crypto");

const designs = require("../config/designs");
const accentColors = require("../config/accentColors");
const motifs = require("../config/motifs");
const { readStores, findStoreById } = require("../lib/storesStore");
const { readSkus, findSkuById } = require("../lib/skusStore");
const { appendOrder } = require("../lib/ordersStore");
const {
  sanitizeInitials,
  isValidInitials,
  sanitizePhone,
  validateCustomerInfo
} = require("../lib/validators");
const { sendSpecSheetEmail } = require("../lib/emailProvider");
const { buildCmykPdf } = require("../lib/printAsset");

const router = express.Router();

function generateReferenceId() {
  return "HP-SKIN-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

function publicSkuShape(s) {
  return {
    id: s.skuId,
    familyName: s.familyName,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    cornerRadiusMm: s.cornerRadiusMm
  };
}

// Store picker: name only, no credentials, no print-provider data exposed.
router.get("/stores", (req, res) => {
  const stores = readStores().map((s) => ({ storeId: s.storeId, storeName: s.storeName }));
  res.json(stores);
});

router.get("/skus", (req, res) => {
  res.json(readSkus().map(publicSkuShape));
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

  const {
    skuId,
    designId,
    accentId,
    motifId,
    previewPng,
    customerName,
    customerNumber,
    customerEmail,
    customerAddress,
    customerCity,
    customerState,
    customerPincode,
    consent
  } = req.body || {};
  const initials = sanitizeInitials(req.body && req.body.initials);

  const skuRow = findSkuById(skuId);
  const sku = skuRow ? publicSkuShape(skuRow) : null;
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

  const customerCheck = validateCustomerInfo({
    name: customerName,
    number: customerNumber,
    email: customerEmail,
    address: customerAddress,
    city: customerCity,
    state: customerState,
    pincode: customerPincode
  });
  if (!customerCheck.ok) {
    return res.status(400).json({ error: customerCheck.reason });
  }
  if (consent !== true) {
    return res.status(400).json({ error: "Consent to HP's privacy statement is required" });
  }

  const previewPngBuffer = Buffer.from(previewPng.split(",")[1], "base64");
  const referenceId = generateReferenceId();
  const timestamp = new Date().toISOString();

  const customer = {
    name: String(customerName).trim(),
    number: sanitizePhone(customerNumber),
    email: String(customerEmail).trim(),
    address: String(customerAddress).trim(),
    city: String(customerCity).trim(),
    state: String(customerState).trim(),
    pincode: String(customerPincode).trim()
  };

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
    timestamp,
    customer
  };

  let emailStatus = "sent";
  let emailError = null;

  // Print-ready CMYK conversion is a best-effort enhancement - if it fails
  // for some reason, the order still goes out with just the RGB PNG
  // rather than blocking the customer's submission entirely.
  let cmykPdfBuffer = null;
  try {
    cmykPdfBuffer = await buildCmykPdf({
      pngBuffer: previewPngBuffer,
      widthMm: sku.widthMm,
      heightMm: sku.heightMm
    });
  } catch (err) {
    console.error(`[submit] CMYK PDF generation failed for ${referenceId}:`, err.message);
  }

  try {
    await sendSpecSheetEmail({
      toAddresses: store.printProviderEmails,
      specSheet,
      previewPngBuffer,
      cmykPdfBuffer
    });
  } catch (err) {
    emailStatus = "failed";
    emailError = err.message;
    console.error(`[submit] email send failed for ${referenceId}:`, err.message);
  }

  appendOrder({
    referenceId,
    timestamp,
    storeId: store.storeId,
    storeName: store.storeName,
    region: store.region,
    printProviderName: store.printProviderName,
    skuId: sku.id,
    skuFamily: sku.familyName,
    widthMm: sku.widthMm,
    heightMm: sku.heightMm,
    designId: design.id,
    designName: design.name,
    initials,
    accentId: accent.id,
    accentName: accent.name,
    motifId: motif.id,
    motifName: motif.name,
    customerName: customer.name,
    customerNumber: customer.number,
    customerEmail: customer.email,
    customerAddress: customer.address,
    customerCity: customer.city,
    customerState: customer.state,
    customerPincode: customer.pincode,
    consentGiven: true,
    emailStatus,
    emailError
  });

  if (emailStatus === "failed") {
    return res.status(502).json({
      error: "We couldn't send your order to the print provider. Please try again or ask a store associate for help.",
      referenceId
    });
  }

  res.json({ referenceId, timestamp });
});

module.exports = router;
