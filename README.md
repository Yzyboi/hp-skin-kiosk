# HP Skin Studio Kiosk

In-store, customer-facing kiosk for customizing an HP laptop skin (SKU +
design + initials), plus a separate admin console for managing
store/print-provider data. "HP Skin Studio" is a placeholder name pending
final naming; the header logomark is a placeholder pending the real HP
World logomark.

Anonymous by design: only store selection, SKU, design, initials, and a
generated reference ID are ever collected. No customer name, phone, or
email is captured or logged anywhere.

## Stack

- Node.js + Express, plain HTML/CSS/JS front end (no build step)
- Nodemailer over Gmail SMTP for order emails to print providers
- No database - runtime data lives in `data/stores.json`, admin-managed only
- Session-based auth for `/admin`; the kiosk's "store select" step sets
  session context only, with no credential check

## Getting started (local dev)

```bash
npm install
cp .env.example .env
# edit .env - see "Environment variables" below
npm start
```

- Kiosk: http://localhost:3000/
- Admin console: http://localhost:3000/admin

## Environment variables

See `.env.example` for the full list. Required:

| Var | Purpose |
|---|---|
| `SESSION_SECRET` | Signs the Express session cookie. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never hard-code or leave as a default. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | Single shared admin login. See "Admin password" below. |
| `DATA_DIR` | Directory holding `stores.json`. See "Hosting / DATA_DIR" below. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Gmail SMTP. See "Gmail App Password" below. |

## Gmail App Password

Gmail SMTP requires an App Password, not the account's normal login
password (Google disables plain-password SMTP by default).

1. Use (or create) a Gmail account dedicated to this kiosk.
2. Turn on 2-Step Verification on that account: myaccount.google.com/security.
3. Go to myaccount.google.com/apppasswords, create an app password (name it
   e.g. "HP Skin Kiosk"), and copy the 16-character password.
4. Set:
   - `SMTP_USER` = the Gmail address
   - `SMTP_APP_PASSWORD` = the 16-character app password (no spaces)
   - `EMAIL_FROM` = usually the same address, e.g. `"HP Skin Studio Kiosk" <that-address@gmail.com>`

Gmail's free-tier sending limit is ~500 messages/day, which is expected to
be sufficient for a single-kiosk pilot.

## Generating the admin password hash

```bash
npm run hash-password -- "your-chosen-password"
```

This prints an `ADMIN_PASSWORD_HASH` line to paste into `.env` (or the
host's env var dashboard). The password itself is never stored - only its
bcrypt hash.

## Excel upload / merge behavior

Admin dashboard → "Download template" gets an `.xlsx` with the required
header row (sheet name `Stores`) and one example row:

| Column | Required | Notes |
|---|---|---|
| Store ID | Yes | Unique key used for merge matching |
| Store Name | Yes | Shown to customers in the store picker |
| Region | No | Display/grouping only - not used for email routing |
| Print Provider Name | Yes | Shown in the print provider's spec-sheet email |
| Print Provider Email(s) | Yes | One or more addresses, `;` or `,` separated |

**Merge logic**, applied per upload:
- A Store ID already in `stores.json` → that row's fields are updated.
- A new Store ID → the row is added.
- Any store currently in `stores.json` but absent from the uploaded file →
  left untouched (uploads never delete stores).

**Validation**, per row (a bad row is skipped, not fatal to the rest of
the file):
- `Store ID` and `Store Name` must be non-blank.
- `Print Provider Name` must be non-blank.
- `Print Provider Email(s)` must contain at least one syntactically valid
  email address (invalid addresses in a multi-address cell are dropped;
  the row is only skipped if *none* of its addresses are valid).

After processing, the dashboard shows counts of rows added / updated /
skipped, with the specific reason and Excel row number for every skipped
row.

## Adding real SKUs, designs, accent colors, and motifs

- SKUs: edit `config/skus.js`. Each entry is `{ id, familyName, widthMm,
  heightMm, cornerRadiusMm? }`. These drive the live-preview aspect ratio
  and print dimensions - no other assets are needed per SKU.
- Designs: drop the asset (SVG preferred, high-res PNG accepted) into
  `public/designs/`, then add an entry to `config/designs.js`:
  `{ id, name, assetPath, zone: { xPct, yPct, widthPct, heightPct, align,
  followsAccent, fixedColor }, motifZone: { xPct, yPct, widthPct, heightPct } }`.
  Percentages are relative to the design's own bounding box, so they hold
  across every SKU's aspect ratio. The design artwork itself is a fixed,
  static image (it does not recolor with the Accent Colour picker below) -
  only the initials text (when `zone.followsAccent` is true) and the motif
  icon drawn inside `motifZone` pick up the customer's chosen accent.
- Accent colors: edit `config/accentColors.js` - `{ id, name, hex }`.
- Motifs: edit `config/motifs.js` - `{ id, name }`. The actual icon shape
  for each motif id is drawn in `public/js/kiosk.js` (`MOTIF_ICON_HTML` for
  the on-screen preview, `drawMotif()` for the rasterized PNG that gets
  emailed) - add a case there if you introduce a new motif id.

## Swapping Gmail SMTP for Amazon SES

All email sending goes through `lib/emailProvider.js`'s single
`sendSpecSheetEmail()` export - no other file talks to Nodemailer/Gmail
directly. The swap path is documented in a comment at the top of that
file: install `@aws-sdk/client-sesv2`, point Nodemailer at SES's
transport (or write a small adapter with the same function signature),
and update `config/email.js` to read AWS credentials/region instead of
SMTP host/port/app-password. No caller changes.

## Hosting

This app stores runtime data as flat JSON, so **persistent disk is
required** - an ephemeral filesystem will silently reset
`data/stores.json` back to its placeholder seed on every restart or
redeploy, discarding all admin Excel uploads.

Target platform: **Render** (Starter plan, ~$7/mo) with a small persistent
disk add-on (well under 1GB), or **Railway** as an equivalent alternative
with a persistent volume. Free tiers are out of scope here - they either
spin down on inactivity (slow first load) or lack persistent disk
entirely. Avoid serverless/functions-style hosts (e.g. Vercel) - the
admin upload+merge flow needs a long-lived writable filesystem.

### `DATA_DIR`

- **Local dev:** leave `DATA_DIR=./data` (or unset it) - it uses the
  repo's `data/` folder directly.
- **Production (Render/Railway):** mount the persistent disk at a fixed
  path (e.g. `/data`) and set `DATA_DIR=/data`. On first boot with no
  existing `stores.json` at that path, the app copies the seed data from
  the repo so the kiosk is usable immediately; after that, only the admin
  Excel upload flow (or a manual edit) changes it.

Getting `DATA_DIR` wrong in production (e.g. leaving it pointing at the
app's ephemeral working directory) means every deploy quietly wipes out
uploaded store data with no error - double-check this env var whenever
the app is redeployed to a new host or plan.

No custom domain is needed for the pilot; the platform's default
subdomain (`*.onrender.com` etc.) is fine.

## Error handling

- **Email send:** `POST /api/submit` awaits the send and returns an
  explicit error (HTTP 502, with a customer-facing message and the
  already-generated reference ID) on failure - never a silent success.
  Failures are logged server-side (reference ID + error message only, no
  personal data).
- **Excel upload:** a file that fails to parse at all (corrupt/wrong
  format) returns an error immediately with nothing merged. A file that
  parses but has bad individual rows still merges every valid row and
  reports the skipped ones with reasons - see "Excel upload / merge
  behavior" above.

## Where a database would slot in

This is a flat-file build sized for a pilot. If it needs to scale past
that, `lib/storesStore.js` is the intended seam - `readStores()`,
`writeStores()`, and `mergeStoreRows()` are the only functions the rest of
the app depends on, so swapping the JSON file for a real datastore (e.g.
Postgres) only touches that one module.
