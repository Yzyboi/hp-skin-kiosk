// Shared validation used by both the kiosk API (customization text) and
// the admin Excel merge upload (store rows / emails).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The kiosk's customization text field ("initials" in the API/order
// schema for historical reasons, but any design can configure it to hold
// a longer name - see zone.maxLength on the design record). No character
// filtering beyond trimming and uppercasing - a design that wants free
// text (e.g. a full name) gets it as typed, just capitalized to match
// the kiosk's all-caps styling. maxLength of 0/undefined means no cap.
function sanitizeCustomizationText(raw, maxLength) {
  const trimmed = String(raw || "").trim().toUpperCase();
  return maxLength > 0 ? trimmed.slice(0, maxLength) : trimmed;
}

function isValidCustomizationText(raw, maxLength) {
  const value = String(raw || "");
  if (value.length < 1) return false;
  if (maxLength > 0 && value.length > maxLength) return false;
  return true;
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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALIGN_VALUES = new Set(["left", "center", "right"]);
// Deliberately conservative: this string ends up both in a CSS
// font-family value and in a Google Fonts URL, so it's restricted to
// characters that appear in real Google Font family names (letters,
// digits, spaces, hyphens) - nothing that could break out of either
// context.
const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/;

function parsePct(raw, fieldLabel) {
  const n = Number(raw);
  if (String(raw || "").trim() === "" || !Number.isFinite(n)) {
    return { ok: false, reason: `${fieldLabel} must be a number` };
  }
  if (n < 0 || n > 100) {
    return { ok: false, reason: `${fieldLabel} must be between 0 and 100` };
  }
  return { ok: true, value: n };
}

// Validates the admin design-upload form fields (multipart/form-data, so
// every raw value arrives as a string). zone is a percentage rectangle
// relative to the design's own artwork, used to place the customer's
// customization text. Colour and font are fixed per design - there's no
// customer-facing accent colour picker, so both are required here.
function validateDesignFields(raw) {
  const name = String(raw.name || "").trim();
  if (!name) return { ok: false, reason: "Name is required" };

  const align = String(raw.zoneAlign || "").trim().toLowerCase();
  if (!ALIGN_VALUES.has(align)) {
    return { ok: false, reason: "Zone align must be left, center, or right" };
  }

  const color = String(raw.zoneColor || "").trim();
  if (!HEX_COLOR_RE.test(color)) {
    return { ok: false, reason: "Colour must be a hex value like #0B4FD1" };
  }

  const fontFamily = String(raw.zoneFontFamily || "").trim();
  if (!FONT_FAMILY_RE.test(fontFamily)) {
    return { ok: false, reason: "Font must be a Google Font family name (letters, digits, spaces, hyphens only)" };
  }

  const fieldLabel = String(raw.zoneFieldLabel || "").trim();
  if (!fieldLabel || fieldLabel.length > 40) {
    return { ok: false, reason: "Field label is required (max 40 characters), e.g. \"initials\" or \"astronaut name\"" };
  }

  let maxLength = 0;
  const maxLengthRaw = String(raw.zoneMaxLength || "").trim();
  if (maxLengthRaw !== "") {
    maxLength = Number(maxLengthRaw);
    if (!Number.isInteger(maxLength) || maxLength < 0) {
      return { ok: false, reason: "Max length must be a whole number (0 or blank for no limit)" };
    }
  }

  const pctFields = [
    ["zoneXPct", "Zone X%"],
    ["zoneYPct", "Zone Y%"],
    ["zoneWidthPct", "Zone Width%"],
    ["zoneHeightPct", "Zone Height%"]
  ];
  const pct = {};
  for (const [key, label] of pctFields) {
    const result = parsePct(raw[key], label);
    if (!result.ok) return result;
    pct[key] = result.value;
  }
  if (pct.zoneWidthPct <= 0 || pct.zoneHeightPct <= 0) {
    return { ok: false, reason: "Zone Width% and Height% must be greater than 0" };
  }

  return {
    ok: true,
    name,
    zone: {
      xPct: pct.zoneXPct,
      yPct: pct.zoneYPct,
      widthPct: pct.zoneWidthPct,
      heightPct: pct.zoneHeightPct,
      align,
      color,
      fontFamily,
      fieldLabel,
      maxLength
    }
  };
}

module.exports = {
  sanitizeCustomizationText,
  isValidCustomizationText,
  isValidEmail,
  splitEmails,
  validateStoreRow,
  validateSkuRow,
  slugify,
  isValidPhone,
  sanitizePhone,
  isValidPincode,
  validateCustomerInfo,
  validateDesignFields
};
