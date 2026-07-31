// Shared validation used by both the kiosk API (initials) and the admin
// Excel merge upload (store rows / emails).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Letters only, auto-uppercased, 1-3 characters. Strips anything that
// isn't a letter (numbers/symbols/spaces) before validating, matching the
// spec's "hard cap enforced" requirement.
function sanitizeInitials(raw) {
  return String(raw || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

function isValidInitials(raw) {
  return /^[A-Z]{1,3}$/.test(raw);
}

function isValidEmail(addr) {
  return EMAIL_RE.test(String(addr || "").trim());
}

// Splits a "a@x.com; b@y.com, c@z.com" cell into individual addresses.
function splitEmails(cell) {
  return String(cell || "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Validates one parsed Excel row against the Section 5 schema.
// Returns { ok: true, row } or { ok: false, reason }.
function validateStoreRow(rawRow) {
  const storeId = String(rawRow["Store ID"] || "").trim();
  const storeName = String(rawRow["Store Name"] || "").trim();
  const region = String(rawRow["Region"] || "").trim();
  const printProviderName = String(rawRow["Print Provider Name"] || "").trim();
  const emails = splitEmails(rawRow["Print Provider Email(s)"]);

  if (!storeId) return { ok: false, reason: "Missing Store ID" };
  if (!storeName) return { ok: false, reason: "Missing Store Name" };
  if (!printProviderName) return { ok: false, reason: "Missing Print Provider Name" };

  const validEmails = emails.filter(isValidEmail);
  if (validEmails.length === 0) {
    return { ok: false, reason: "No syntactically valid Print Provider Email(s)" };
  }

  return {
    ok: true,
    row: {
      storeId,
      storeName,
      region,
      printProviderName,
      printProviderEmails: validEmails
    }
  };
}

module.exports = {
  sanitizeInitials,
  isValidInitials,
  isValidEmail,
  splitEmails,
  validateStoreRow
};
