// Excel generation/parsing for the admin console, using ExcelJS. Generic
// builders (buildWorkbook / buildDataWorkbook / parseWorkbook) are shared
// across every resource (stores, SKUs, orders) - only the header/example
// definitions below are resource-specific.

const ExcelJS = require("exceljs");

const STORE_HEADERS = [
  "Store ID",
  "Store Name",
  "Region",
  "Print Provider Name",
  "Print Provider Email(s)"
];

const STORE_EXAMPLE_ROW = [
  "HP-004",
  "HP World - Example Store",
  "Central",
  "Example Print Co.",
  "orders@exampleprint.com; backup@exampleprint.com"
];

const SKU_HEADERS = ["SKU ID", "Family Name", "Width (mm)", "Height (mm)", "Corner Radius (mm)"];

const SKU_EXAMPLE_ROW = ["elitebook-x", "EliteBook X", "330", "225", "8"];

const ORDER_HEADERS = [
  "Reference ID",
  "Timestamp",
  "Store ID",
  "Store Name",
  "Region",
  "Print Provider Name",
  "SKU ID",
  "SKU Family",
  "Width (mm)",
  "Height (mm)",
  "Design ID",
  "Design Name",
  "Initials",
  "Accent Colour",
  "Motif",
  "Customer Name",
  "Customer Number",
  "Customer Email",
  "City",
  "State",
  "Pincode",
  "Email Status"
];

// Builds an upload template: header row (bold) + one example row.
async function buildWorkbook({ sheetName, headers, exampleRow }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = headers.map((h) => ({ header: h, width: Math.max(String(h).length + 4, 18) }));
  if (exampleRow) sheet.addRow(exampleRow);
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

// Builds a data export: header row (bold) + real rows (array of arrays,
// each matching the headers' order).
async function buildDataWorkbook({ sheetName, headers, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = headers.map((h) => ({ header: h, width: Math.max(String(h).length + 2, 14) }));
  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

// Parses an uploaded .xlsx Buffer into an array of raw row objects keyed
// by header name. Throws if the file can't be parsed at all (corrupt
// file, wrong format) - row-level problems are handled separately by the
// caller via validators.js, per spec ("malformed rows are skipped, not
// fatal").
async function parseWorkbook(buffer, preferredSheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet(preferredSheetName) || workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Workbook contains no sheets");
  }

  const headerRow = sheet.getRow(1);
  const columnHeaders = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    columnHeaders[colNumber] = String(cell.value || "").trim();
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = columnHeaders[colNumber];
      if (header) obj[header] = cellToString(cell.value);
    });
    // Skip fully blank rows (common trailing rows in spreadsheets).
    if (Object.values(obj).some((v) => String(v || "").trim() !== "")) {
      rows.push(obj);
    }
  });

  return rows;
}

function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.text) return value.text; // rich text
  if (typeof value === "object" && value.result !== undefined) return value.result; // formula
  return String(value);
}

module.exports = {
  STORE_HEADERS,
  STORE_EXAMPLE_ROW,
  SKU_HEADERS,
  SKU_EXAMPLE_ROW,
  ORDER_HEADERS,
  buildWorkbook,
  buildDataWorkbook,
  parseWorkbook
};
