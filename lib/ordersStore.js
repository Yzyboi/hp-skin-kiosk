// Runtime, append-only log of placed orders (data/orders.json).
//
// NOTE: this deliberately breaks from the original "fully anonymous
// kiosk" design - the product now captures customer name/phone/email/
// address on a dedicated screen after the design is finalized, and that
// data is persisted here (as well as included in the print-provider
// email) so an admin can look orders up and export them. Lives under
// DATA_DIR so it survives restarts/redeploys on a host with a
// persistent disk (see README "Hosting").
//
// Flat-file + full-array rewrite-on-append is a pilot-scale choice, same
// caveat as storesStore.js/skusStore.js: if this needs to scale past a
// modest order volume or gain concurrent-writer safety, this module is
// the seam where a real database would slot in.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");

const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]");
  }
}

function readOrders() {
  ensureFile();
  const raw = fs.readFileSync(ORDERS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`orders.json is corrupt and could not be parsed: ${err.message}`);
  }
}

function appendOrder(order) {
  ensureFile();
  const orders = readOrders();
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  return order;
}

// Merges `patch` onto the order matching referenceId and rewrites the
// file - used by the background delivery pipeline (see orderDelivery.js)
// to record composite/PDF/email attempts as they happen, after the order
// itself was already persisted and the customer's response sent. No-op
// (returns null) if the referenceId isn't found, which callers treat as
// non-fatal - the delivery attempt still happened, only the status
// record couldn't be updated.
function updateOrder(referenceId, patch) {
  ensureFile();
  const orders = readOrders();
  const index = orders.findIndex((o) => o.referenceId === referenceId);
  if (index === -1) return null;
  orders[index] = { ...orders[index], ...patch };
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  return orders[index];
}

function findOrderByReferenceId(referenceId) {
  return readOrders().find((o) => o.referenceId === referenceId) || null;
}

// fromDate/toDate: Date objects, inclusive on both ends.
function findOrdersInRange(fromDate, toDate) {
  return readOrders().filter((o) => {
    const t = new Date(o.timestamp);
    return t >= fromDate && t <= toDate;
  });
}

module.exports = {
  DATA_DIR,
  ORDERS_FILE,
  readOrders,
  appendOrder,
  updateOrder,
  findOrderByReferenceId,
  findOrdersInRange
};
