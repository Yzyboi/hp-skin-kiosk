// Runtime access to the SKU catalog (data/skus.json).
//
// SKUs used to be a static developer-edited config file; they're now
// admin-managed the same way stores.json is - seeded with placeholders,
// updated only through the admin Excel upload flow (or a manual edit in
// a pinch). Lives under DATA_DIR so it survives restarts/redeploys on a
// host with a persistent disk (see README "Hosting").

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");

const SKUS_FILE = path.join(DATA_DIR, "skus.json");
const SEED_FILE = path.join(__dirname, "..", "data", "skus.json");

function ensureSeeded() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SKUS_FILE)) {
    const seed = fs.existsSync(SEED_FILE) ? fs.readFileSync(SEED_FILE, "utf8") : "[]";
    fs.writeFileSync(SKUS_FILE, seed);
  }
}

function readSkus() {
  ensureSeeded();
  const raw = fs.readFileSync(SKUS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`skus.json is corrupt and could not be parsed: ${err.message}`);
  }
}

function writeSkus(skus) {
  ensureSeeded();
  fs.writeFileSync(SKUS_FILE, JSON.stringify(skus, null, 2));
}

// Merge validated rows into the current dataset by SKU ID - same
// semantics as storesStore.mergeStoreRows: existing IDs updated, new IDs
// added, SKUs not present in the uploaded file left untouched.
function mergeSkuRows(validRows) {
  const skus = readSkus();
  const byId = new Map(skus.map((s) => [s.skuId, s]));
  const now = new Date().toISOString();

  let added = 0;
  let updated = 0;

  for (const row of validRows) {
    const existing = byId.get(row.skuId);
    if (existing) {
      Object.assign(existing, row, { updatedAt: now });
      updated += 1;
    } else {
      byId.set(row.skuId, { ...row, updatedAt: now });
      added += 1;
    }
  }

  const merged = Array.from(byId.values());
  writeSkus(merged);
  return { added, updated, skus: merged };
}

function findSkuById(skuId) {
  return readSkus().find((s) => s.skuId === skuId) || null;
}

// Removes a single SKU by ID. Returns true if a row was actually
// removed, false if no row matched (caller should 404 in that case).
function deleteSku(skuId) {
  const skus = readSkus();
  const remaining = skus.filter((s) => s.skuId !== skuId);
  if (remaining.length === skus.length) return false;
  writeSkus(remaining);
  return true;
}

module.exports = {
  DATA_DIR,
  SKUS_FILE,
  readSkus,
  writeSkus,
  mergeSkuRows,
  findSkuById,
  deleteSku
};
