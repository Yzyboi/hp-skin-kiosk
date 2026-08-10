// Admin console API: single shared admin login, Excel template downloads,
// Excel upload + merge-by-ID for stores and SKUs, and read-only views of
// the current datasets plus a date-range Orders export. Entirely separate
// session flag from the kiosk's store context (see middleware/auth.js).

const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { requireAdmin } = require("../middleware/auth");
const { readStores, mergeStoreRows } = require("../lib/storesStore");
const { readSkus, mergeSkuRows } = require("../lib/skusStore");
const { readOrders, findOrdersInRange } = require("../lib/ordersStore");
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
const { validateStoreRow, validateSkuRow } = require("../lib/validators");

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

// Shared upload -> parse -> per-row validate -> merge -> summary flow,
// used by both the store and SKU upload endpoints below.
function handleMergeUpload({ sheetName, validateRow, mergeRows }) {
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

      rawRows.forEach((raw, i) => {
        const excelRowNumber = i + 2; // header is row 1
        const result = validateRow(raw);
        if (result.ok) {
          validRows.push(result.row);
        } else {
          skipped.push({ row: excelRowNumber, reason: result.reason });
        }
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
  handleMergeUpload({ sheetName: "Stores", validateRow: validateStoreRow, mergeRows: mergeStoreRows })
);

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
  handleMergeUpload({ sheetName: "SKUs", validateRow: validateSkuRow, mergeRows: mergeSkuRows })
);

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
    o.skuFamily,
    o.widthMm,
    o.heightMm,
    o.designId,
    o.designName,
    o.initials,
    o.accentName,
    o.motifName,
    o.customerName,
    o.customerNumber,
    o.customerEmail,
    o.customerAddress,
    o.customerCity,
    o.customerState,
    o.customerPincode,
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
