// Email delivery, isolated behind sendSpecSheetEmail() so the rest of the
// app never touches Nodemailer/Gmail directly.
//
// --- Swapping Gmail SMTP for Amazon SES later -------------------------
// 1. Install the SES SDK: npm install @aws-sdk/client-sesv2
// 2. Replace the `nodemailer.createTransport(emailConfig)` call below with
//    either:
//      a) nodemailer's built-in SES transport:
//         const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
//         const transporter = nodemailer.createTransport({
//           SES: { sesClient: new SESv2Client({ region: "us-east-1" }), SendEmailCommand }
//         });
//      b) or call SES's SendEmail API directly and build a small adapter
//         that exposes the same sendSpecSheetEmail(...) signature used here.
// 3. Update config/email.js to read AWS credentials/region instead of SMTP
//    host/port/app-password vars.
// No other file in the app needs to change - every caller only imports
// sendSpecSheetEmail from this module.
// ------------------------------------------------------------------------

const nodemailer = require("nodemailer");
const emailConfig = require("../config/email");

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: emailConfig.auth,
      // Fail fast on network trouble instead of hanging the kiosk request.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

// specSheet: { designId, designName, skuFamily, widthMm, heightMm, initials,
//              storeName, region, printProviderName, referenceId, timestamp }
// previewPngBuffer: Buffer of the rendered PNG
// toAddresses: string[] of print-provider recipient emails
//
// Throws on failure - callers must catch and respond with an explicit
// error (never a silent fail), per spec.
async function sendSpecSheetEmail({ toAddresses, specSheet, previewPngBuffer }) {
  if (!toAddresses || toAddresses.length === 0) {
    throw new Error("No print provider recipient email(s) configured for this store");
  }

  const lines = [
    `Reference ID: ${specSheet.referenceId}`,
    `Timestamp: ${specSheet.timestamp}`,
    "",
    `Store: ${specSheet.storeName}${specSheet.region ? ` (${specSheet.region})` : ""}`,
    `Print Provider: ${specSheet.printProviderName}`,
    "",
    `Design: ${specSheet.designName} (${specSheet.designId})`,
    `SKU: ${specSheet.skuFamily} - ${specSheet.widthMm}mm x ${specSheet.heightMm}mm`,
    `Initials: ${specSheet.initials}`
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
        <tr><td><b>SKU</b></td><td>${specSheet.skuFamily} - ${specSheet.widthMm}mm x ${specSheet.heightMm}mm</td></tr>
        <tr><td><b>Initials</b></td><td>${specSheet.initials}</td></tr>
      </table>
      <p style="color:#666;margin-top:16px;">Preview attached as PNG.</p>
    </div>
  `;

  const info = await getTransporter().sendMail({
    from: emailConfig.from,
    replyTo: emailConfig.replyTo,
    to: toAddresses.join(", "),
    subject: `HP Skin Studio order ${specSheet.referenceId} - ${specSheet.storeName}`,
    text: lines.join("\n"),
    html,
    attachments: [
      {
        filename: `${specSheet.referenceId}.png`,
        content: previewPngBuffer,
        contentType: "image/png"
      }
    ]
  });

  return info;
}

module.exports = { sendSpecSheetEmail };
