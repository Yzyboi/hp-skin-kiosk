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

const { readStores, findStoreById } = require("../lib/storesStore");
const { readSkus, findSkuById } = require("../lib/skusStore");
const { readDesigns, findDesignById } = require("../lib/designsStore");
const { appendOrder, findOrderByReferenceId } = require("../lib/ordersStore");
const {
  sanitizeCustomizationText,
  isValidCustomizationText,
  sanitizePhone,
  validateCustomerInfo
} = require("../lib/validators");
const { deliverOrder } = require("../lib/orderDelivery");

const router = express.Router();

function generateReferenceId() {
  return "HP-SKIN-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

// Customer-facing SKU picker only shows Model Name + Family (Series /
// Category) - the rest of the admin-managed spec sheet (form factor,
// hinges, logo, weight, verification source) stays server-side. Width/
// height/cornerRadiusMm are still included because the client needs them
// to render the live preview and rasterize the final image, even though
// they're never displayed as a customer-facing spec.
function publicSkuShape(s) {
  return {
    id: s.skuId,
    modelName: s.modelName,
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
  res.json(readDesigns());
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
    customerName,
    customerNumber,
    customerEmail,
    customerAddress,
    customerCity,
    customerState,
    customerPincode,
    consent
  } = req.body || {};

  const skuRow = findSkuById(skuId);
  const sku = skuRow ? publicSkuShape(skuRow) : null;
  const design = findDesignById(designId);

  if (!sku) return res.status(400).json({ error: "Invalid SKU" });
  if (!design) return res.status(400).json({ error: "Invalid design" });

  const maxLength = design.zone.maxLength || 0;
  const initials = sanitizeCustomizationText(req.body && req.body.initials, maxLength);
  if (!isValidCustomizationText(initials, maxLength)) {
    return res.status(400).json({
      error: maxLength > 0 ? `Enter up to ${maxLength} characters` : "This field is required"
    });
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
    skuModelName: sku.modelName,
    skuFamily: sku.familyName,
    widthMm: sku.widthMm,
    heightMm: sku.heightMm,
    initials,
    storeName: store.storeName,
    region: store.region,
    printProviderName: store.printProviderName,
    referenceId,
    timestamp,
    customer
  };

  // The order is persisted and the customer's response sent immediately -
  // compositing the print asset, building the CMYK PDF, and emailing the
  // print provider (with retries - see orderDelivery.js) all happen
  // afterward, off the customer's wait. A real delivery failure is no
  // longer shown live; it's recorded here for the admin console's Orders
  // view (emailStatus/emailError) and for the kiosk's own status poll
  // below to pick up while the customer is still standing there.
  appendOrder({
    referenceId,
    timestamp,
    storeId: store.storeId,
    storeName: store.storeName,
    region: store.region,
    printProviderName: store.printProviderName,
    skuId: sku.id,
    skuModelName: sku.modelName,
    skuFamily: sku.familyName,
    widthMm: sku.widthMm,
    heightMm: sku.heightMm,
    designId: design.id,
    designName: design.name,
    initials,
    customerName: customer.name,
    customerNumber: customer.number,
    customerEmail: customer.email,
    customerAddress: customer.address,
    customerCity: customer.city,
    customerState: customer.state,
    customerPincode: customer.pincode,
    consentGiven: true,
    emailStatus: "pending",
    emailError: null,
    emailAttempts: 0
  });

  req.session.lastOrderRef = referenceId;
  res.json({ referenceId, timestamp, emailStatus: "pending" });

  deliverOrder({ referenceId, store, specSheet, design, sku, initials }).catch((err) => {
    // deliverOrder already records failures on the order itself - this
    // only guards against a genuinely unexpected bug in the pipeline
    // (not a delivery failure) turning into an unhandled rejection.
    console.error(`[submit] unexpected error delivering order ${referenceId}:`, err);
  });
});

// Lets the kiosk poll for how the order it just placed is actually
// doing, now that the response above doesn't wait for it - scoped to
// this session's own last order rather than taking a referenceId
// directly, so one kiosk session can't probe another customer's order
// status via a guessed/observed reference ID.
router.get("/orders/last-status", (req, res) => {
  const referenceId = req.session.lastOrderRef;
  if (!referenceId) {
    return res.status(404).json({ error: "No recent order in this session" });
  }
  const order = findOrderByReferenceId(referenceId);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  res.json({
    referenceId: order.referenceId,
    emailStatus: order.emailStatus,
    emailError: order.emailStatus === "failed" ? order.emailError : undefined
  });
});

module.exports = router;
