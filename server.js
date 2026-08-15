require("dotenv").config();

// Last-resort safety net: this one process serves every store's kiosk, so
// an error that would otherwise be an unhandled rejection/exception (Node
// kills the whole process on those by default) needs to fail loudly and
// restart cleanly rather than take every store down with no clear cause in
// the logs. Route-level handling (see lib/asyncHandler.js) should catch
// almost everything before it gets here - this only fires for whatever
// slips past that. Exiting (instead of trying to keep running) is
// deliberate: process state after an uncaught error can't be trusted, and
// the host (Render/Railway) restarts the process automatically.
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled rejection - exiting so the host can restart cleanly:", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaught exception - exiting so the host can restart cleanly:", err);
  process.exit(1);
});

const path = require("path");
const express = require("express");
const session = require("express-session");
const SessionMemoryStore = require("memorystore")(session);
const sharp = require("sharp");

// sharp's native libvips layer defaults its worker thread pool to the
// host's CPU count and keeps its own operation cache - both add memory
// overhead that scales with the host, not with what this app actually
// needs. Pinned to a small fixed number instead, matching the compositing
// concurrency cap in lib/orderDelivery.js, so baseline/peak memory stay
// predictable across different hosts/plans.
sharp.cache(false);
sharp.concurrency(2);

const kioskRoutes = require("./routes/kiosk");
const adminRoutes = require("./routes/admin");
const { requireAdmin } = require("./middleware/auth");
const { ASSETS_DIR: DESIGN_ASSETS_DIR } = require("./lib/designsStore");
const { startRetrySweep } = require("./lib/orderRetrySweep");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.error(
    "FATAL: SESSION_SECRET is not set. Copy .env.example to .env and set a long random value."
  );
  process.exit(1);
}

app.use(express.json({ limit: "1mb" })); // all JSON bodies are plain text fields now that the preview PNG is composited server-side
app.use(
  session({
    // express-session's built-in MemoryStore only evicts an expired
    // session when that same session ID is looked up again - a kiosk
    // customer who selects a store once and never comes back (the common
    // case, one order per visit) leaves that session sitting in memory
    // forever. Across 62 stores that's exactly what a memory graph
    // climbing in steps and never coming back down looks like.
    // memorystore proactively sweeps out expired entries on a timer
    // (checkPeriod) regardless of whether they're ever revisited, and
    // `max` is a hard ceiling in case traffic ever outpaces the sweep.
    store: new SessionMemoryStore({
      checkPeriod: 60 * 60 * 1000, // sweep hourly
      max: 5000
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000 // 12h - long enough for a kiosk shift
    }
  })
);

// --- Customer-facing kiosk ---
app.use("/api", kioskRoutes);
app.use(express.static(path.join(__dirname, "public"), { index: false, redirect: false }));
// Admin-uploaded design artwork lives under DATA_DIR (not public/) so it
// survives redeploys on a host with a persistent disk - see designsStore.js.
app.use("/design-assets", express.static(DESIGN_ASSETS_DIR, { index: false, redirect: false }));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Admin console ---
app.use("/admin", adminRoutes);
app.get("/admin", (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect("/admin/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "admin", "login.html"));
});
app.get("/admin/dashboard", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "dashboard.html"));
});

app.use((err, req, res, next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(`HP Skin Studio kiosk listening on http://localhost:${PORT}`);
  console.log(`Admin console at http://localhost:${PORT}/admin`);
});

// Picks up orders whose email delivery is still "retrying" after the
// fast in-request attempts in orderDelivery.js were exhausted - see that
// module for the full retry/backoff story.
startRetrySweep();
