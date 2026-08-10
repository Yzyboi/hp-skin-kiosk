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

// Validates one parsed SKU Excel row. Returns { ok: true, row } or
// { ok: false, reason }.
function validateSkuRow(rawRow) {
  const skuId = String(rawRow["SKU ID"] || "").trim();
  const familyName = String(rawRow["Family Name"] || "").trim();
  const widthRaw = rawRow["Width (mm)"];
  const heightRaw = rawRow["Height (mm)"];
  const radiusRaw = rawRow["Corner Radius (mm)"];

  if (!skuId) return { ok: false, reason: "Missing SKU ID" };
  if (!familyName) return { ok: false, reason: "Missing Family Name" };

  const widthMm = Number(widthRaw);
  if (String(widthRaw || "").trim() === "" || !Number.isFinite(widthMm) || widthMm <= 0) {
    return { ok: false, reason: "Width (mm) must be a positive number" };
  }

  const heightMm = Number(heightRaw);
  if (String(heightRaw || "").trim() === "" || !Number.isFinite(heightMm) || heightMm <= 0) {
    return { ok: false, reason: "Height (mm) must be a positive number" };
  }

  let cornerRadiusMm;
  if (String(radiusRaw || "").trim() !== "") {
    cornerRadiusMm = Number(radiusRaw);
    if (!Number.isFinite(cornerRadiusMm) || cornerRadiusMm < 0) {
      return { ok: false, reason: "Corner Radius (mm) must be a non-negative number" };
    }
  }

  return { ok: true, row: { skuId, familyName, widthMm, heightMm, cornerRadiusMm } };
}

// Digits-only phone check - lenient on formatting (spaces/dashes/+country
// code are stripped), just bounds the digit count to something plausible.
function isValidPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function sanitizePhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

// Alphanumeric to accommodate both numeric (US/India) and alphanumeric
// (Canada/UK) postal codes.
function isValidPincode(raw) {
  return /^[A-Za-z0-9 -]{3,10}$/.test(String(raw || "").trim());
}

// Validates the customer-info screen's fields. Returns { ok: true } or
// { ok: false, field, reason }.
function validateCustomerInfo({ name, number, email, city, state, pincode }) {
  if (!String(name || "").trim()) {
    return { ok: false, field: "name", reason: "Name is required" };
  }
  if (!isValidPhone(number)) {
    return { ok: false, field: "number", reason: "Enter a valid phone number" };
  }
  if (!isValidEmail(email)) {
    return { ok: false, field: "email", reason: "Enter a valid email address" };
  }
  if (!String(city || "").trim()) {
    return { ok: false, field: "city", reason: "City is required" };
  }
  if (!String(state || "").trim()) {
    return { ok: false, field: "state", reason: "State is required" };
  }
  if (!isValidPincode(pincode)) {
    return { ok: false, field: "pincode", reason: "Enter a valid pincode" };
  }
  return { ok: true };
}

module.exports = {
  sanitizeInitials,
  isValidInitials,
  isValidEmail,
  splitEmails,
  validateStoreRow,
  validateSkuRow,
  isValidPhone,
  sanitizePhone,
  isValidPincode,
  validateCustomerInfo
};
