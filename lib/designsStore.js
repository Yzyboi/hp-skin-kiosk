// Runtime access to the design catalog (data/designs.json + the SVG
// artwork files under data/design-assets/).
//
// Designs used to be a static developer-edited config file; they're now
// admin-managed the same way stores.json/skus.json are - uploaded and
// edited from the admin dashboard's Designs section, never touched by
// the customer-facing app. Lives under DATA_DIR so both the JSON record
// and the uploaded SVG bytes survive restarts/redeploys on a host with a
// persistent disk (see README "Hosting").
//
// The uploaded SVG file is stored and served byte-for-byte as given -
// the admin flow never re-encodes, minifies, or recolors it, since the
// base artwork must render exactly as submitted.

const fs = require("fs");
const path = require("path");
const { slugify } = require("./validators");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");

const DESIGNS_FILE = path.join(DATA_DIR, "designs.json");
const ASSETS_DIR = path.join(DATA_DIR, "design-assets");
const SEED_FILE = path.join(__dirname, "..", "data", "designs.json");
const SEED_ASSETS_DIR = path.join(__dirname, "..", "data", "design-assets");

function ensureSeeded() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DESIGNS_FILE)) {
    const seed = fs.existsSync(SEED_FILE) ? fs.readFileSync(SEED_FILE, "utf8") : "[]";
    fs.writeFileSync(DESIGNS_FILE, seed);
    if (fs.existsSync(SEED_ASSETS_DIR)) {
      for (const filename of fs.readdirSync(SEED_ASSETS_DIR)) {
        fs.copyFileSync(path.join(SEED_ASSETS_DIR, filename), path.join(ASSETS_DIR, filename));
      }
    }
  }
}

function readDesigns() {
  ensureSeeded();
  const raw = fs.readFileSync(DESIGNS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`designs.json is corrupt and could not be parsed: ${err.message}`);
  }
}

function writeDesigns(designs) {
  ensureSeeded();
  fs.writeFileSync(DESIGNS_FILE, JSON.stringify(designs, null, 2));
}

function findDesignById(designId) {
  return readDesigns().find((d) => d.id === designId) || null;
}

function assetFilePath(id) {
  ensureSeeded();
  return path.join(ASSETS_DIR, `${id}.svg`);
}

// Derives a unique, URL-safe design ID from the admin-supplied name,
// disambiguating collisions with -2, -3, etc. (same approach as SKU IDs).
function uniqueIdFromName(name, existingIds) {
  const base = slugify(name) || "design";
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Adds a new design: writes the raw SVG bytes to disk untouched and
// appends the JSON record. fields: { name, zone }.
// svgBuffer: raw bytes of the uploaded .svg file.
function addDesign({ name, zone, svgBuffer }) {
  const designs = readDesigns();
  const existingIds = new Set(designs.map((d) => d.id));
  const id = uniqueIdFromName(name, existingIds);
  const now = new Date().toISOString();

  fs.writeFileSync(assetFilePath(id), svgBuffer);

  const record = {
    id,
    name,
    assetPath: `/design-assets/${id}.svg`,
    zone,
    updatedAt: now
  };
  designs.push(record);
  writeDesigns(designs);
  return record;
}

// Updates an existing design's fields. If svgBuffer is provided, the
// artwork file is replaced (still byte-for-byte, no re-encoding);
// otherwise the existing asset is left as-is. Returns the updated
// record, or null if no design with that ID exists.
function updateDesign(id, { name, zone, svgBuffer }) {
  const designs = readDesigns();
  const existing = designs.find((d) => d.id === id);
  if (!existing) return null;

  if (svgBuffer) {
    fs.writeFileSync(assetFilePath(id), svgBuffer);
  }
  existing.name = name;
  existing.zone = zone;
  existing.updatedAt = new Date().toISOString();

  writeDesigns(designs);
  return existing;
}

// Removes a design and its artwork file. Returns true if a row was
// actually removed, false if no row matched (caller should 404).
function deleteDesign(id) {
  const designs = readDesigns();
  const remaining = designs.filter((d) => d.id !== id);
  if (remaining.length === designs.length) return false;
  writeDesigns(remaining);
  const assetPath = assetFilePath(id);
  if (fs.existsSync(assetPath)) {
    fs.unlinkSync(assetPath);
  }
  return true;
}

module.exports = {
  DATA_DIR,
  DESIGNS_FILE,
  ASSETS_DIR,
  readDesigns,
  writeDesigns,
  findDesignById,
  addDesign,
  updateDesign,
  deleteDesign
};
