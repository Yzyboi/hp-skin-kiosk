// Admin-console auth guard. Entirely separate from the kiosk's store
// session context - admin status lives at req.session.isAdmin, kiosk
// store context lives at req.session.storeId. Both share one signed
// express-session cookie (SESSION_SECRET) but are checked independently.

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  return res.redirect("/admin");
}

module.exports = { requireAdmin };
