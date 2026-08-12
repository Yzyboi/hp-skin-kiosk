// Email delivery, isolated behind sendSpecSheetEmail() so the rest of the
// app never touches Resend directly.
//
// This talks to Resend's HTTP API rather than SMTP - Render (the target
// host, see README "Hosting") blocks outbound SMTP ports (25/465/587) on
// all plans to prevent spam abuse, which made Gmail SMTP fail every send
// with a connection timeout regardless of credentials. HTTP over 443
// isn't affected.
//
// --- Swapping Resend for another provider later ------------------------
// Any other transactional-email HTTP API (SendGrid, Mailgun, Postmark,
// SES's HTTP API) works the same way: install its SDK, replace the
// `new Resend(...)`/`.emails.send(...)` calls below with that provider's
// equivalent, and update config/email.js to read whatever credentials it
// needs instead of RESEND_API_KEY. No other file in the app needs to
// change - every caller only imports sendSpecSheetEmail from this module.
// ------------------------------------------------------------------------

const { Resend } = require("resend");
const emailConfig = require("../config/email");

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

let client = null;
function getClient() {
  if (!client) {
    client = new Resend(emailConfig.apiKey);
  }
  return client;
}

// specSheet: { designId, designName, skuModelName, skuFamily, widthMm, heightMm, initials,
//              storeName, region, printProviderName,
//              referenceId, timestamp,
//              customer: { name, number, email, city, state, pincode } }
// cmykPdfBuffer: Buffer of the print-ready CMYK PDF (see lib/printAsset.js)
// toAddresses: string[] of print-provider recipient emails
//
// Throws on failure - callers must catch and respond with an explicit
// error (never a silent fail), per spec.
async function sendSpecSheetEmail({ toAddresses, specSheet, cmykPdfBuffer }) {
  if (!toAddresses || toAddresses.length === 0) {
    throw new Error("No print provider recipient email(s) configured for this store");
  }

  const c = specSheet.customer || {};

  const lines = [
    `Reference ID: ${specSheet.referenceId}`,
    `Timestamp: ${specSheet.timestamp}`,
    "",
    `Store: ${specSheet.storeName}${specSheet.region ? ` (${specSheet.region})` : ""}`,
    `Print Provider: ${specSheet.printProviderName}`,
    "",
    `Design: ${specSheet.designName} (${specSheet.designId})`,
    `SKU: ${specSheet.skuModelName} (${specSheet.skuFamily}) - ${specSheet.widthMm}mm x ${specSheet.heightMm}mm`,
    `Initials: ${specSheet.initials}`,
    "",
    `Customer Name: ${c.name || ""}`,
    `Customer Phone: ${c.number || ""}`,
    `Customer Email: ${c.email || ""}`,
    `Address: ${c.address || ""}`,
    `City: ${c.city || ""}`,
    `State: ${c.state || ""}`,
    `Pincode: ${c.pincode || ""}`
  ];

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">
      <h2 style="color:#024AD8;margin:0 0 12px;">HP Skin Studio - New Order</h2>
      <table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><b>Reference ID</b></td><td>${specSheet.referenceId}</td></tr>
        <tr><td><b>Timestamp</b></td><td>${specSheet.timestamp}</td></tr>
        <tr><td><b>Store</b></td><td>${specSheet.storeName}${specSheet.region ? ` (${specSheet.region})` : ""}</td></tr>
        <tr><td><b>Print Provider</b></td><td>${specSheet.printProviderName}</td></tr>
        <tr><td><b>Design</b></td><td>${specSheet.designName} (${specSheet.designId})</td></tr>
        <tr><td><b>SKU</b></td><td>${specSheet.skuModelName} (${specSheet.skuFamily}) - ${specSheet.widthMm}mm x ${specSheet.heightMm}mm</td></tr>
        <tr><td><b>Initials</b></td><td>${escapeHtml(specSheet.initials)}</td></tr>
        <tr><td colspan="2" style="padding-top:10px;"><b>Customer</b></td></tr>
        <tr><td>Name</td><td>${escapeHtml(c.name || "")}</td></tr>
        <tr><td>Phone</td><td>${escapeHtml(c.number || "")}</td></tr>
        <tr><td>Email</td><td>${escapeHtml(c.email || "")}</td></tr>
        <tr><td>Address</td><td>${escapeHtml(c.address || "")}</td></tr>
        <tr><td>City</td><td>${escapeHtml(c.city || "")}</td></tr>
        <tr><td>State</td><td>${escapeHtml(c.state || "")}</td></tr>
        <tr><td>Pincode</td><td>${escapeHtml(c.pincode || "")}</td></tr>
      </table>
      <p style="color:#666;margin-top:16px;">Print-ready CMYK PDF attached.</p>
    </div>
  `;

  // Resend's SDK types claim `content` accepts a raw Buffer, but nothing
  // in the SDK actually base64-encodes it - it goes straight into
  // JSON.stringify(), where Node's default Buffer serialization produces
  // a comma-separated array of decimal byte values ({"type":"Buffer",
  // "data":[...]}) instead of base64. That's ~3-4x larger than proper
  // base64, which is what was tripping Resend's 40mb attachment limit on
  // ordinary-sized designs. Encoding explicitly here avoids that bloat.
  const attachments = [
    {
      filename: `${specSheet.referenceId}-${specSheet.widthMm}x${specSheet.heightMm}mm.pdf`,
      content: cmykPdfBuffer.toString("base64"),
      contentType: "application/pdf"
    }
  ];

  const { data, error } = await getClient().emails.send({
    from: emailConfig.from,
    replyTo: emailConfig.replyTo,
    to: toAddresses,
    subject: `HP Skin Studio order ${specSheet.referenceId} - ${specSheet.storeName}`,
    text: lines.join("\n"),
    html,
    attachments
  });

  if (error) {
    // Resend's SDK doesn't throw on API/network failure, it resolves
    // with { error } instead (see node_modules/resend fetchRequest) - so
    // every caller relying on a rejected promise for retry/error-logging
    // (see lib/orderDelivery.js) needs this turned into a real throw.
    const err = new Error(error.message || "Resend API error");
    err.name = error.name;
    err.statusCode = error.statusCode;
    throw err;
  }

  return data;
}

module.exports = { sendSpecSheetEmail };
