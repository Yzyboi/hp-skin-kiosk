require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");

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
