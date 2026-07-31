// Admin console API: single shared admin login, Excel template download,
// Excel upload + merge-by-Store-ID, and a read-only view of the current
// store dataset. Entirely separate session flag from the kiosk's store
// context (see middleware/auth.js).

const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { requireAdmin } = require("../middleware/auth");
const { readStores, mergeStoreRows } = require("../lib/storesStore");
const { buildTemplateWorkbook, parseStoresWorkbook } = require("../lib/excelTemplate");
const { validateStoreRow } = require("../lib/validators");

const router = express.Router();

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

router.get("/api/stores", requireAdmin, (req, res) => {
  res.json(readStores());
});

router.get("/api/template", requireAdmin, async (req, res) => {
  const buffer = await buildTemplateWorkbook();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=hp-skin-kiosk-store-template.xlsx");
  res.send(buffer);
});

router.post("/api/upload", requireAdmin, (req, res) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let rawRows;
    try {
      rawRows = await parseStoresWorkbook(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: `Could not parse workbook: ${err.message}` });
    }

    const validRows = [];
    const skipped = [];

    rawRows.forEach((raw, i) => {
      const excelRowNumber = i + 2; // header is row 1
      const result = validateStoreRow(raw);
      if (result.ok) {
        validRows.push(result.row);
      } else {
        skipped.push({ row: excelRowNumber, reason: result.reason });
      }
    });

    const { added, updated } = mergeStoreRows(validRows);

    res.json({
      totalRows: rawRows.length,
      added,
      updated,
      skippedCount: skipped.length,
      skipped
    });
  });
});

module.exports = router;
