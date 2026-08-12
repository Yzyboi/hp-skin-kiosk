// SMTP configuration, read from environment variables (.env locally, host
// dashboard env vars in production). Never hard-code secrets here.
//
// This module only describes *how to connect*. The actual send logic lives
// in lib/emailProvider.js, which is the single module to touch if this
// provider is ever swapped for Amazon SES - see the comment at the top of
// that file for the swap path.
require("dotenv").config();

module.exports = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_APP_PASSWORD
  },
  from: process.env.EMAIL_FROM || process.env.SMTP_USER,
  replyTo: process.env.EMAIL_REPLY_TO || undefined
};
