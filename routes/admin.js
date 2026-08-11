// Admin console API: single shared admin login, Excel template downloads,
// Excel upload + merge-by-ID for stores and SKUs, and read-only views of
// the current datasets plus a date-range Orders export. Entirely separate
// session flag from the kiosk's store context (see middleware/auth.js).

const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { requireAdmin } = require("../middleware/auth");
const { readStores, mergeStoreRows, deleteStore } = require("../lib/storesStore");
const { readSkus, mergeSkuRows, deleteSku } = require("../lib/skusStore");
const { readOrders, findOrdersInRange } = require("../lib/ordersStore");
const { readDesigns, addDesign, updateDesign, deleteDesign } = require("../lib/designsStore");
const {
  STORE_HEADERS,
  STORE_EXAMPLE_ROW,
  SKU_HEADERS,
  SKU_EXAMPLE_ROW,
  ORDER_HEADERS,
  buildWorkbook,
  buildDataWorkbook,
  parseWorkbook
} = require("../lib/excelTemplate");
const { validateStoreRow, validateSkuRow, validateDesignFields } = require("../lib/validators");

const router = express.Router();
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okExt = /\.xlsx$/i.test(file.originalname);
    const okMime =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/octet-stream";
    if (okExt && okMime) return cb(null, true);
    cb(new Error("Only .xlsx files are accepted"));
  }
});

// Accepts the raw SVG or PNG artwork file for a design. No re-encoding
// happens anywhere in this pipeline - the bytes multer buffers here are
// the exact bytes designsStore writes to disk and serves back, so the
// artwork customers see is byte-for-byte what the admin uploaded.
const uploadDesignAsset = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okExt = /\.(svg|png)$/i.test(file.originalname);
    const okMime = [
      "image/svg+xml",
      "image/png",
      "text/plain",
      "application/octet-stream"
    ].includes(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    cb(new Error("Only .svg or .png files are accepted"));
  }
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Detects the real format from file content (not just the extension/MIME
// type the browser reported), so a mislabeled upload can't slip past the
// filter above. Returns "svg", "png", or null if neither is recognized.
function detectDesignAssetType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 1000)).trim();
  if (/<svg[\s>]/i.test(head)) {
    return "svg";
  }
  return null;
}

// Shared upload -> parse -> per-row validate -> merge -> summary flow,
// used by both the store and SKU upload endpoints below. idField names
// the property validateRow's returned row uses as its unique key (e.g.
// "storeId"/"skuId") - rows within the same file that resolve to an
// already-seen ID (e.g. two Model Names that slugify the same way) are
// skipped rather than silently overwriting an earlier row in the batch.
function handleMergeUpload({ sheetName, idField, validateRow, mergeRows }) {
  return (req, res) => {
    upload.single("file")(req, res, async (multerErr) => {
      if (multerErr) {
        return res.status(400).json({ error: multerErr.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let rawRows;
      try {
        rawRows = await parseWorkbook(req.file.buffer, sheetName);
      } catch (err) {
        return res.status(400).json({ error: `Could not parse workbook: ${err.message}` });
      }

      const validRows = [];
      const skipped = [];
      const seenIds = new Set();

      rawRows.forEach((raw, i) => {
        const excelRowNumber = i + 2; // header is row 1
        const result = validateRow(raw);
        if (!result.ok) {
          skipped.push({ row: excelRowNumber, reason: result.reason });
          return;
        }
        const id = result.row[idField];
        if (seenIds.has(id)) {
          skipped.push({ row: excelRowNumber, reason: `Duplicate ${idField} "${id}" earlier in this file` });
          return;
        }
        seenIds.add(id);
        validRows.push(result.row);
      });

      const { added, updated } = mergeRows(validRows);

      res.json({
        totalRows: rawRows.length,
        added,
        updated,
        skippedCount: skipped.length,
        skipped
      });
    });
  };
}

router.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUser || !expectedHash) {
    return res.status(500).json({ error: "Admin credentials are not configured on the server" });
  }
  if (username !== expectedUser) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const ok = bcrypt.compareSync(String(password || ""), expectedHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  req.session.isAdmin = true;
  req.session.adminUsername = username;
  res.json({ ok: true });
});

router.post("/api/logout", (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

router.get("/api/session", (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.isAdmin),
    username: req.session ? req.session.adminUsername : null
  });
});

// --- Stores -----------------------------------------------------------

router.get("/api/stores", requireAdmin, (req, res) => {
  res.json(readStores());
});

router.get("/api/stores/template", requireAdmin, async (req, res) => {
  const buffer = await buildWorkbook({
    sheetName: "Stores",
    headers: STORE_HEADERS,
    exampleRow: STORE_EXAMPLE_ROW
  });
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", "attachment; filename=hp-skin-kiosk-store-template.xlsx");
  res.send(buffer);
});

router.post(
  "/api/stores/upload",
  requireAdmin,
  handleMergeUpload({ sheetName: "Stores", idField: "storeId", validateRow: validateStoreRow, mergeRows: mergeStoreRows })
);

router.delete("/api/stores/:storeId", requireAdmin, (req, res) => {
  const deleted = deleteStore(req.params.storeId);
  if (!deleted) return res.status(404).json({ error: "Store not found" });
  res.json({ ok: true });
});

// --- SKUs ---------------------------------------------------------------

router.get("/api/skus", requireAdmin, (req, res) => {
  res.json(readSkus());
});

router.get("/api/skus/template", requireAdmin, async (req, res) => {
  const buffer = await buildWorkbook({
    sheetName: "SKUs",
    headers: SKU_HEADERS,
    exampleRow: SKU_EXAMPLE_ROW
  });
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", "attachment; filename=hp-skin-kiosk-sku-template.xlsx");
  res.send(buffer);
});

router.post(
  "/api/skus/upload",
  requireAdmin,
  handleMergeUpload({ sheetName: "SKUs", idField: "skuId", validateRow: validateSkuRow, mergeRows: mergeSkuRows })
);

router.delete("/api/skus/:skuId", requireAdmin, (req, res) => {
  const deleted = deleteSku(req.params.skuId);
  if (!deleted) return res.status(404).json({ error: "SKU not found" });
  res.json({ ok: true });
});

// --- Designs --------------------------------------------------------------
//
// Unlike Stores/SKUs, designs aren't bulk-uploaded via Excel - each one
// carries a binary SVG or PNG asset plus hand-tuned zone coordinates, so
// they're created/edited one at a time through a dedicated form (see the
// Designs section of the admin dashboard).

router.get("/api/designs", requireAdmin, (req, res) => {
  res.json(readDesigns());
});

router.post("/api/designs", requireAdmin, (req, res) => {
  uploadDesignAsset.single("file")(req, res, (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    if (!req.file) return res.status(400).json({ error: "No SVG or PNG file uploaded" });
    const assetType = detectDesignAssetType(req.file.buffer);
    if (!assetType) {
      return res.status(400).json({ error: "That file doesn't look like a valid SVG or PNG" });
    }

    const result = validateDesignFields(req.body || {});
    if (!result.ok) return res.status(400).json({ error: result.reason });

    const record = addDesign({
      name: result.name,
      zone: result.zone,
      fileBuffer: req.file.buffer,
      assetType
    });
    res.json(record);
  });
});

router.put("/api/designs/:designId", requireAdmin, (req, res) => {
  uploadDesignAsset.single("file")(req, res, (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    const assetType = req.file ? detectDesignAssetType(req.file.buffer) : null;
    if (req.file && !assetType) {
      return res.status(400).json({ error: "That file doesn't look like a valid SVG or PNG" });
    }

    const result = validateDesignFields(req.body || {});
    if (!result.ok) return res.status(400).json({ error: result.reason });

    const updated = updateDesign(req.params.designId, {
      name: result.name,
      zone: result.zone,
      fileBuffer: req.file ? req.file.buffer : null,
      assetType
    });
    if (!updated) return res.status(404).json({ error: "Design not found" });
    res.json(updated);
  });
});

router.delete("/api/designs/:designId", requireAdmin, (req, res) => {
  const deleted = deleteDesign(req.params.designId);
  if (!deleted) return res.status(404).json({ error: "Design not found" });
  res.json({ ok: true });
});

// --- Orders -------------------------------------------------------------

router.get("/api/orders", requireAdmin, (req, res) => {
  const orders = readOrders()
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(orders);
});

function orderToRow(o) {
  return [
    o.referenceId,
    o.timestamp,
    o.storeId,
    o.storeName,
    o.region || "",
    o.printProviderName,
    o.skuId,
    o.skuModelName,
    o.skuFamily,
    o.widthMm,
    o.heightMm,
    o.designId,
    o.designName,
    o.initials,
    o.customerName,
    o.customerNumber,
    o.customerEmail,
    o.customerAddress,
    o.customerCity,
    o.customerState,
    o.customerPincode,
    o.consentGiven ? "Yes" : "No",
    o.emailStatus
  ];
}

router.get("/api/orders/export", requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "'from' and 'to' query params are required (YYYY-MM-DD)" });
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "Invalid date format - use YYYY-MM-DD" });
  }
  if (fromDate > toDate) {
    return res.status(400).json({ error: "'from' date must be on or before 'to' date" });
  }

  const orders = findOrdersInRange(fromDate, toDate).sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const buffer = await buildDataWorkbook({
    sheetName: "Orders",
    headers: ORDER_HEADERS,
    rows: orders.map(orderToRow)
  });

  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=hp-skin-kiosk-orders_${from}_to_${to}.xlsx`
  );
  res.send(buffer);
});

module.exports = router;
