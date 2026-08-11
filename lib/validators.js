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

// URL-safe ID derived from the SKU Model Name (no ID column in the
// source spec sheet, and S.No.-style columns aren't reliably unique).
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// "YES"/"NO" (case-insensitive) -> true/false; blank -> undefined (not
// specified). Anything else is treated as not specified too, rather than
// failing the whole row over an optional field.
function parseYesNo(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "YES") return true;
  if (v === "NO") return false;
  return undefined;
}

// Validates one parsed SKU Excel row against the HP spec-sheet schema:
// SKU Model Name, Series / Category, Form Factor, Width (cm), Depth (cm),
// Height (cm), Hinges at Back, Premium Logo at Back, Weight (kg),
// Verification Source. Returns { ok: true, row } or { ok: false, reason }.
//
// Width/Depth (cm) become the skin's print dimensions (widthMm/heightMm) -
// that's the flat lid surface a skin actually covers. Height (cm) is the
// laptop's closed thickness, unrelated to the print area - kept only as
// reference spec data.
function validateSkuRow(rawRow) {
  const modelName = String(rawRow["SKU Model Name"] || "").trim();
  const familyName = String(rawRow["Series / Category"] || "").trim();
  const formFactor = String(rawRow["Form Factor"] || "").trim();
  const widthCmRaw = rawRow["Width (cm)"];
  const depthCmRaw = rawRow["Depth (cm)"];
  const heightCmRaw = rawRow["Height (cm)"];
  const weightRaw = rawRow["Weight (kg)"];
  const verificationSource = String(rawRow["Verification Source"] || "").trim();

  if (!modelName) return { ok: false, reason: "Missing SKU Model Name" };
  if (!familyName) return { ok: false, reason: "Missing Series / Category" };

  const widthCm = Number(widthCmRaw);
  if (String(widthCmRaw || "").trim() === "" || !Number.isFinite(widthCm) || widthCm <= 0) {
    return { ok: false, reason: "Width (cm) must be a positive number" };
  }

  const depthCm = Number(depthCmRaw);
  if (String(depthCmRaw || "").trim() === "" || !Number.isFinite(depthCm) || depthCm <= 0) {
    return { ok: false, reason: "Depth (cm) must be a positive number" };
  }

  let thicknessMm;
  if (String(heightCmRaw || "").trim() !== "") {
    const heightCm = Number(heightCmRaw);
    if (!Number.isFinite(heightCm) || heightCm < 0) {
      return { ok: false, reason: "Height (cm) must be a non-negative number" };
    }
    thicknessMm = round2(heightCm * 10);
  }

  let weightKg;
  if (String(weightRaw || "").trim() !== "") {
    weightKg = Number(weightRaw);
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      return { ok: false, reason: "Weight (kg) must be a non-negative number" };
    }
  }

  const skuId = slugify(modelName);
  if (!skuId) return { ok: false, reason: "Could not derive a SKU ID from the Model Name" };

  return {
    ok: true,
    row: {
      skuId,
      modelName,
      familyName,
      formFactor: formFactor || undefined,
      widthMm: round2(widthCm * 10),
      heightMm: round2(depthCm * 10),
      thicknessMm,
      hingesAtBack: parseYesNo(rawRow["Hinges at Back"]),
      premiumLogoAtBack: parseYesNo(rawRow["Premium Logo at Back"]),
      weightKg,
      verificationSource: verificationSource || undefined
    }
  };
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
function validateCustomerInfo({ name, number, email, address, city, state, pincode }) {
  if (!String(name || "").trim()) {
    return { ok: false, field: "name", reason: "Name is required" };
  }
  if (!isValidPhone(number)) {
    return { ok: false, field: "number", reason: "Enter a valid phone number" };
  }
  if (!isValidEmail(email)) {
    return { ok: false, field: "email", reason: "Enter a valid email address" };
  }
  if (!String(address || "").trim()) {
    return { ok: false, field: "address", reason: "Address is required" };
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
  slugify,
  isValidPhone,
  sanitizePhone,
  isValidPincode,
  validateCustomerInfo
};
