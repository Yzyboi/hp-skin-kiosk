// Runtime access to the store/print-provider dataset (data/stores.json).
//
// This file is admin-managed only - the customer-facing app never writes
// to it. It lives under DATA_DIR so it survives restarts/redeploys on a
// host with a persistent disk (see README "Hosting"). If DATA_DIR isn't
// set, it falls back to the repo's ./data folder for local dev.
//
// NOTE: flat-file storage is a pilot-scale choice. If this needs to scale
// past a handful of admin uploads per day or gain concurrent-writer
// safety, this module is the seam where a real database (e.g. Postgres)
// would slot in - readStores()/writeStores()/mergeStoreRows() are the only
// three functions the rest of the app depends on.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");

const STORES_FILE = path.join(DATA_DIR, "stores.json");
const SEED_FILE = path.join(__dirname, "..", "data", "stores.json");

function ensureSeeded() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORES_FILE)) {
    const seed = fs.existsSync(SEED_FILE)
      ? fs.readFileSync(SEED_FILE, "utf8")
      : "[]";
    fs.writeFileSync(STORES_FILE, seed);
  }
}

function readStores() {
  ensureSeeded();
  const raw = fs.readFileSync(STORES_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`stores.json is corrupt and could not be parsed: ${err.message}`);
  }
}

function writeStores(stores) {
  ensureSeeded();
  fs.writeFileSync(STORES_FILE, JSON.stringify(stores, null, 2));
}

// Merge validated rows into the current dataset by Store ID.
// - Existing Store ID -> fields updated in place.
// - New Store ID -> appended.
// - Store rows not present in the uploaded file -> left untouched.
// Returns { added, updated } counts; the caller is responsible for
// combining this with the per-row skip list gathered during validation.
function mergeStoreRows(validRows) {
  const stores = readStores();
  const byId = new Map(stores.map((s) => [s.storeId, s]));
  const now = new Date().toISOString();

  let added = 0;
  let updated = 0;

  for (const row of validRows) {
    const existing = byId.get(row.storeId);
    if (existing) {
      existing.storeName = row.storeName;
      existing.region = row.region;
      existing.printProviderName = row.printProviderName;
      existing.printProviderEmails = row.printProviderEmails;
      existing.updatedAt = now;
      updated += 1;
    } else {
      byId.set(row.storeId, { ...row, updatedAt: now });
      added += 1;
    }
  }

  const merged = Array.from(byId.values());
  writeStores(merged);
  return { added, updated, stores: merged };
}

function findStoreById(storeId) {
  return readStores().find((s) => s.storeId === storeId) || null;
}

module.exports = {
  DATA_DIR,
  STORES_FILE,
  readStores,
  writeStores,
  mergeStoreRows,
  findStoreById
};
