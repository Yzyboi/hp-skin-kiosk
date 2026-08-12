// Background order delivery: composites the print asset, builds the CMYK
// PDF, and emails the print provider - all off the customer's request/
// response cycle (see routes/kiosk.js POST /submit). The customer's
// confirmation no longer waits on any of this; it only waits on the order
// being durably persisted.
//
// Email delivery specifically is retried, since an SMTP hiccup is the
// single most likely (and most transient) failure in this pipeline:
//   - 3 fast attempts happen right away (0s, +5s, +30s), covering the
//     window the customer might still be standing at the kiosk.
//   - If those are all exhausted, the order is left in "retrying" status
//     (not yet a permanent failure) for lib/orderRetrySweep.js to keep
//     retrying on a slower cadence in the background.
//   - Only once MAX_TOTAL_ATTEMPTS is exhausted does the order become
//     permanently "failed", surfaced to admins via the Orders view's
//     emailStatus column - there's still no silent failure, it just no
//     longer blocks (or is visible live to) the customer.
//
// Composite/PDF-build failures are NOT retried the same way an email
// send is - they're deterministic (a corrupt asset file isn't going to
// fix itself), so retrying them on the same cadence would just waste
// cycles re-doing the same failing work. They're recorded as an
// immediate permanent failure instead.

const { findStoreById } = require("./storesStore");
const { findDesignById } = require("./designsStore");
const { updateOrder } = require("./ordersStore");
const { compositeDesignPng } = require("./designComposite");
const { buildCmykPdf } = require("./printAsset");
const { sendSpecSheetEmail } = require("./emailProvider");

const FAST_RETRY_DELAYS_MS = [0, 5000, 30000];
// Budget shared with orderRetrySweep.js - attempts beyond the fast
// retries above are spent by the periodic sweep, roughly every
// SWEEP_INTERVAL_MS, until this total is reached.
const MAX_TOTAL_ATTEMPTS = 8;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function specSheetFromOrder(order) {
  return {
    designId: order.designId,
    designName: order.designName,
    skuModelName: order.skuModelName,
    skuFamily: order.skuFamily,
    widthMm: order.widthMm,
    heightMm: order.heightMm,
    initials: order.initials,
    storeName: order.storeName,
    region: order.region,
    printProviderName: order.printProviderName,
    referenceId: order.referenceId,
    timestamp: order.timestamp,
    customer: {
      name: order.customerName,
      number: order.customerNumber,
      email: order.customerEmail,
      address: order.customerAddress,
      city: order.customerCity,
      state: order.customerState,
      pincode: order.customerPincode
    }
  };
}

// Logged with code/command/responseCode (not just message) since a
// timeout waiting for the final SMTP response looks identical to a real
// delivery failure from err.message alone, but they need very different
// fixes - the extra fields distinguish them.
function logEmailError(referenceId, attempt, err) {
  console.error(`[order ${referenceId}] email attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, {
    message: err.message,
    code: err.code,
    command: err.command,
    responseCode: err.responseCode
  });
}

function recordEmailFailure(referenceId, attempt, err) {
  logEmailError(referenceId, attempt, err);
  const permanentlyFailed = attempt >= MAX_TOTAL_ATTEMPTS;
  updateOrder(referenceId, {
    emailStatus: permanentlyFailed ? "failed" : "retrying",
    emailError: err.message,
    emailAttempts: attempt
  });
}

async function sendOneAttempt({ referenceId, toAddresses, specSheet, previewPngBuffer, cmykPdfBuffer, attempt }) {
  try {
    await sendSpecSheetEmail({ toAddresses, specSheet, previewPngBuffer, cmykPdfBuffer });
    updateOrder(referenceId, { emailStatus: "sent", emailError: null, emailAttempts: attempt });
    return true;
  } catch (err) {
    recordEmailFailure(referenceId, attempt, err);
    return false;
  }
}

// Composites the design and builds the CMYK PDF once, then makes the
// fast in-request email attempts. Called fire-and-forget right after the
// customer's response is sent (see routes/kiosk.js) - never awaited by
// the request handler.
async function deliverOrder({ referenceId, store, specSheet, design, sku, initials }) {
  let previewPngBuffer;
  try {
    previewPngBuffer = await compositeDesignPng({ design, sku, initials });
  } catch (err) {
    console.error(`[order ${referenceId}] design compositing failed:`, err);
    updateOrder(referenceId, {
      emailStatus: "failed",
      emailError: `Could not generate the design image: ${err.message}`
    });
    return;
  }

  let cmykPdfBuffer = null;
  try {
    cmykPdfBuffer = await buildCmykPdf({ pngBuffer: previewPngBuffer, widthMm: sku.widthMm, heightMm: sku.heightMm });
  } catch (err) {
    console.error(`[order ${referenceId}] CMYK PDF generation failed:`, err.message);
  }

  for (let i = 0; i < FAST_RETRY_DELAYS_MS.length; i++) {
    if (FAST_RETRY_DELAYS_MS[i] > 0) await sleep(FAST_RETRY_DELAYS_MS[i]);
    const attempt = i + 1;
    const sent = await sendOneAttempt({
      referenceId,
      toAddresses: store.printProviderEmails,
      specSheet,
      previewPngBuffer,
      cmykPdfBuffer,
      attempt
    });
    if (sent) return;
  }
  // Still not sent after the fast retries - left in "retrying" status
  // (unless that last attempt happened to hit MAX_TOTAL_ATTEMPTS) for
  // orderRetrySweep.js to pick up.
}

// Used by orderRetrySweep.js for orders that exhausted the fast retries.
// Nothing from the original request survives a process restart, so this
// rebuilds everything (spec sheet, artwork composite, PDF) from the
// persisted order record itself rather than from any in-memory state.
async function retrySweepOrder(order) {
  const store = findStoreById(order.storeId);
  const design = findDesignById(order.designId);
  if (!store || !design) {
    updateOrder(order.referenceId, {
      emailStatus: "failed",
      emailError: "Store or design no longer exists - cannot retry"
    });
    return;
  }

  const sku = { widthMm: order.widthMm, heightMm: order.heightMm };
  let previewPngBuffer;
  try {
    previewPngBuffer = await compositeDesignPng({ design, sku, initials: order.initials });
  } catch (err) {
    console.error(`[order ${order.referenceId}] retry: design compositing failed:`, err);
    updateOrder(order.referenceId, {
      emailStatus: "failed",
      emailError: `Could not regenerate the design image: ${err.message}`
    });
    return;
  }

  let cmykPdfBuffer = null;
  try {
    cmykPdfBuffer = await buildCmykPdf({ pngBuffer: previewPngBuffer, widthMm: sku.widthMm, heightMm: sku.heightMm });
  } catch (err) {
    console.error(`[order ${order.referenceId}] retry: CMYK PDF generation failed:`, err.message);
  }

  const attempt = (order.emailAttempts || 0) + 1;
  await sendOneAttempt({
    referenceId: order.referenceId,
    toAddresses: store.printProviderEmails,
    specSheet: specSheetFromOrder(order),
    previewPngBuffer,
    cmykPdfBuffer,
    attempt
  });
}

module.exports = {
  MAX_TOTAL_ATTEMPTS,
  deliverOrder,
  retrySweepOrder
};
