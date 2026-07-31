// Excel template generation + upload parsing for the admin store dataset,
// using ExcelJS. Schema: single sheet named "Stores" with the header row
// defined in the product spec, Section 5.

const ExcelJS = require("exceljs");

const HEADERS = [
  "Store ID",
  "Store Name",
  "Region",
  "Print Provider Name",
  "Print Provider Email(s)"
];

const EXAMPLE_ROW = [
  "HP-004",
  "HP World - Example Store",
  "Central",
  "Example Print Co.",
  "orders@exampleprint.com; backup@exampleprint.com"
];

async function buildTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stores");
  sheet.columns = HEADERS.map((h) => ({ header: h, width: Math.max(h.length + 4, 22) }));
  sheet.addRow(EXAMPLE_ROW);
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

// Parses an uploaded .xlsx Buffer into an array of raw row objects keyed
// by header name. Throws if the file can't be parsed at all (corrupt file,
// wrong format) - row-level problems are handled separately by the caller
// via validators.validateStoreRow, per spec ("malformed rows are skipped,
// not fatal").
async function parseStoresWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet("Stores") || workbook.worksheets[0];
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

module.exports = { HEADERS, buildTemplateWorkbook, parseStoresWorkbook };
