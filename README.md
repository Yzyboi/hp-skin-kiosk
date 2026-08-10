# HP Skin Studio Kiosk

In-store, customer-facing kiosk for customizing an HP laptop skin (SKU +
design + initials + accent colour + motif), a Customer Info screen that
captures name/phone/email/address before the order is placed, and a
separate admin console for managing store/print-provider data, the SKU
catalog, and exporting placed orders. "HP Skin Studio" is a placeholder
name pending final naming; the header logomark is a placeholder pending
the real HP World logomark.

**Not anonymous.** Every finalized order captures the customer's name,
phone, email, and address (street address, city, state, pincode) on a
dedicated screen after the design is locked in. That data is included in
the spec-sheet email sent to the print provider and persisted
server-side (`data/orders.json`) so it shows up in the admin console's
Orders view and date-range `.xlsx` export, alongside the unique
reference ID.

## Stack

- Node.js + Express, plain HTML/CSS/JS front end (no build step)
- Nodemailer over Gmail SMTP for order emails to print providers
- sharp + pdfkit to convert the customer-facing RGB preview into a
  print-ready CMYK PDF for the print provider (see "Print-ready CMYK
  PDF" below)
- No database - runtime data (stores, SKUs, orders) lives in flat JSON
  files under `data/`; stores and SKUs are admin-managed via Excel
  upload, orders are appended automatically as customers check out
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
| `DATA_DIR` | Directory holding `stores.json`, `skus.json`, and `orders.json`. See "Hosting / DATA_DIR" below. |
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

Both **Stores** and **SKUs** follow the same pattern: admin dashboard →
"Download template" gets an `.xlsx` with the required header row and one
example row; upload merges by ID; a summary reports what happened.

### Stores (sheet name `Stores`)

| Column | Required | Notes |
|---|---|---|
| Store ID | Yes | Unique key used for merge matching |
| Store Name | Yes | Shown to customers in the store picker |
| Region | No | Display/grouping only - not used for email routing |
| Print Provider Name | Yes | Shown in the print provider's spec-sheet email |
| Print Provider Email(s) | Yes | One or more addresses, `;` or `,` separated |

Validation per row: `Store ID`, `Store Name`, and `Print Provider Name`
must be non-blank; `Print Provider Email(s)` must contain at least one
syntactically valid email address (invalid addresses in a multi-address
cell are dropped; the row is only skipped if *none* of its addresses are
valid).

### SKUs (sheet name `SKUs`)

| Column | Required | Notes |
|---|---|---|
| SKU ID | Yes | Unique key used for merge matching |
| Family Name | Yes | Shown to customers on the "Choose your laptop" screen |
| Width (mm) | Yes | Must be a positive number; drives the live-preview aspect ratio |
| Height (mm) | Yes | Must be a positive number |
| Corner Radius (mm) | No | Must be a non-negative number if present |

### Merge logic (both)

- An ID already in the dataset → that row's fields are updated.
- A new ID → the row is added.
- Any row currently in the dataset but absent from the uploaded file →
  left untouched (uploads never delete stores or SKUs).

A bad row is skipped, not fatal to the rest of the file. After
processing, the dashboard shows counts of rows added / updated /
skipped, with the specific reason and Excel row number for every skipped
row.

## Orders

Every finalized order (after the customer fills in the Customer Info
screen) is appended to `data/orders.json` regardless of whether the
print-provider email succeeded or failed, and includes an `emailStatus`
field (`sent` / `failed`) so a failed send is still visible for
follow-up. The admin dashboard's Orders section shows a live table of
every order, and "Export orders" downloads an `.xlsx` for a given date
range (inclusive, matched against the order's timestamp) with every
field - reference ID, store/SKU/design/initials/accent/motif, the
customer's name/phone/email/address/city/state/pincode, and whether they
checked the HP privacy-statement consent box (required to submit).

## Print-ready CMYK PDF

Browsers/`<canvas>`/PNG are RGB-only, so the customer-facing live preview
and its exported PNG are always RGB. `POST /api/submit` converts that PNG
server-side into a CMYK PDF before the order email is sent, via
`lib/printAsset.js`:

1. `sharp` converts the RGB PNG to a CMYK JPEG (the standard way to get a
   correctly Adobe-tagged CMYK JPEG out of libvips).
2. `pdfkit` embeds that JPEG directly into a single-page PDF sized to the
   SKU's true physical print dimensions (millimeters converted to PDF
   points), so the print team can place it 1:1.

The print-provider email gets **both** attachments: `{referenceId}.png`
(RGB, for a quick on-screen look) and `{referenceId}-cmyk.pdf`
(CMYK, the print-ready file). If the CMYK conversion fails for any
reason, that's logged server-side and the order still goes out with just
the PNG rather than blocking the customer's submission.

This currently uses libvips' generic RGB→CMYK transform - not calibrated
to any specific press. Once you have an ICC profile from the actual print
provider, `lib/printAsset.js` documents the one-line swap to use it
instead (drop the `.icc` file in, pass it to sharp's colourspace
conversion) for print-accurate color instead of the generic default.

## Adding real SKUs, designs, accent colors, and motifs

- SKUs are no longer static config - manage them from the admin
  dashboard's SKUs section (see "Excel upload / merge behavior" above).
  The seed data in `data/skus.json` is only used to populate the dataset
  the very first time the app runs against an empty `DATA_DIR`.
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
`data/stores.json`/`data/skus.json` back to their placeholder seed (and
wipe `data/orders.json` entirely) on every restart or redeploy,
discarding all admin Excel uploads and every placed order.

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
  existing `stores.json`/`skus.json` at that path, the app copies the
  seed data from the repo so the kiosk is usable immediately; `orders.json`
  always starts empty (there's nothing to seed - it's real order history).
  After first boot, only the admin Excel upload flow (or a manual edit)
  changes stores/SKUs, and orders are appended automatically as
  customers check out.

Getting `DATA_DIR` wrong in production (e.g. leaving it pointing at the
app's ephemeral working directory) means every deploy quietly wipes out
uploaded store/SKU data and all order history with no error - double-check
this env var whenever the app is redeployed to a new host or plan.

No custom domain is needed for the pilot; the platform's default
subdomain (`*.onrender.com` etc.) is fine.

## Error handling

- **Email send:** `POST /api/submit` awaits the send and returns an
  explicit error (HTTP 502, with a customer-facing message and the
  already-generated reference ID) on failure - never a silent success.
  The order is still persisted either way (with `emailStatus: "failed"`
  and the error message) so it isn't lost, and failures are logged
  server-side.
- **Excel upload** (Stores and SKUs): a file that fails to parse at all
  (corrupt/wrong format) returns an error immediately with nothing
  merged. A file that parses but has bad individual rows still merges
  every valid row and reports the skipped ones with reasons - see "Excel
  upload / merge behavior" above.
- **Orders export:** missing/invalid `from`/`to` query params, or `from`
  after `to`, return an explicit 400 before any file is generated.

## Where a database would slot in

This is a flat-file build sized for a pilot. If it needs to scale past
that, `lib/storesStore.js`, `lib/skusStore.js`, and `lib/ordersStore.js`
are the intended seams - each exposes only the handful of read/write/merge
functions the rest of the app depends on, so swapping the JSON files for a
real datastore (e.g. Postgres) only touches those three modules. Orders
in particular are the most likely to outgrow a flat file first (every
placed order rewrites the whole `orders.json` array), so that's the one
to watch as volume grows.
