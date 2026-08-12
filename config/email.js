// Resend configuration, read from environment variables (.env locally,
// host dashboard env vars in production). Never hard-code secrets here.
//
// This module only describes *how to connect*. The actual send logic
// lives in lib/emailProvider.js, which is the single module to touch if
// this provider is ever swapped for something else - see the comment at
// the top of that file for the swap path.
//
// Was Gmail SMTP via Nodemailer until Render's outbound SMTP port block
// (25/465/587) turned out to silently time out every send - see the
// "Email delivery" section in README for why this is an HTTP API now.
require("dotenv").config();

module.exports = {
  apiKey: process.env.RESEND_API_KEY,
  // Must be an address on a domain verified with Resend (or their
  // onboarding@resend.dev sandbox address for testing) - a bare Gmail
  // address will be rejected, since Resend requires proving domain
  // ownership before it can send as that address. See README "Resend
  // setup".
  from: process.env.EMAIL_FROM,
  replyTo: process.env.EMAIL_REPLY_TO || undefined
};
