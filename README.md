# HP Skin Studio Kiosk

In-store, customer-facing kiosk for customizing an HP laptop skin (SKU +
design + a short piece of customization text - initials, a name,
whatever each design calls for - in the colour and font locked in per
design), a Customer Info screen that
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
| `DATA_DIR` | Directory holding `stores.json`, `skus.json`, `designs.json`, `design-assets/`, and `orders.json`. See "Hosting / DATA_DIR" below. |
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
| SKU Model Name | Yes | Shown to customers on the "Choose your laptop" screen; also slugified into the SKU ID used for merge matching (no separate ID column - re-uploading the same Model Name updates the existing row) |
| Series / Category | Yes | Shown to customers alongside the Model Name |
| Form Factor | No | Backend reference only (e.g. `15.6" Clamshell`) |
| Width (cm) | Yes | Must be a positive number; converted to mm and drives the live-preview print width |
| Depth (cm) | Yes | Must be a positive number; converted to mm and drives the live-preview print height |
| Height (cm) | No | Closed-laptop thickness; stored as `thicknessMm` for reference only, not used for print sizing |
| Hinges at Back | No | `YES`/`NO`; backend reference only, no effect on rendering yet |
| Premium Logo at Back | No | `YES`/`NO`; backend reference only, no effect on rendering yet |
| Weight (kg) | No | Backend reference only |
| Verification Source | No | Backend reference only |

Customers only ever see **Model Name** and **Series / Category** on the
kiosk's SKU picker (which has the same search+list UI as the store
picker) - every other column is admin/backend-only data, visible in the
dashboard's Current SKU data table but not exposed by the public
`/api/skus` endpoint.

### Merge logic (both)

- An ID already in the dataset → that row's fields are updated.
- A new ID → the row is added.
- Any row currently in the dataset but absent from the uploaded file →
  left untouched (uploads never delete stores or SKUs).

A bad row is skipped, not fatal to the rest of the file. After
processing, the dashboard shows counts of rows added / updated /
skipped, with the specific reason and Excel row number for every skipped
row.

### Deleting stores/SKUs

Uploads only ever add or update - they never delete. To remove a store
or SKU record entirely, use the "Delete" button next to it in the
dashboard's Current store data / Current SKU data tables (confirmation
required; this is permanent). Deleting a store or SKU doesn't touch past
orders - `data/orders.json` keeps its own copy of every field at the
time the order was placed, so historical records stay intact.

## Designs

Unlike Stores/SKUs, designs aren't bulk-uploaded via Excel - each one is
a binary SVG or PNG asset plus hand-tuned placement coordinates, so the
admin dashboard's Designs section manages them one at a time through a
dedicated form instead:

- **Name** - shown to customers on the "Choose Your Design" screen.
- **SVG or PNG artwork** - stored and served **exactly as uploaded**.
  Nothing in this pipeline re-encodes, minifies, recolors, rescales, or
  rasterizes it (beyond fitting it to each SKU's aspect ratio at render
  time, same as any `background-size: cover` image) - the artwork a
  customer sees is byte-for-byte what was uploaded, and it stays that
  way through every customization a customer applies on top. The format
  is detected from the file's own content (a PNG signature or an `<svg>`
  tag), not just its extension, and it's saved with a matching
  `.svg`/`.png` file so it's served with the right content type.
- **Zone** - a percentage rectangle (0-100, relative to the artwork's own
  bounding box) where the customer's customization text renders: `X%`,
  `Y%`, `Width%`, `Height%`, text `Align` (left/center/right), a required
  hex **Colour**, and a required **Google Font family** name. Colour and
  font are fixed per design - there's no customer-facing colour or font
  picker, so every design controls exactly how its own text looks. The
  font is fetched from Google Fonts at runtime (a `<link>` tag injected
  the first time that family is needed, matching the name typed into the
  admin form) and loaded via the CSS Font Loading API before it's used,
  so the live preview and the rasterized canvas export never fall back to
  a default font mid-render. Percentage-based placement holds across
  every SKU's aspect ratio.
- **Field label** and **Max length** - what the kiosk calls the
  customer's input (e.g. "initials" produces the prompt "Add your
  initials.") and how many characters it allows (0 or blank means no
  limit). Different designs can ask for completely different things - a
  1-3 letter monogram, a full name, anything in between - without any
  code changes: the kiosk's headline, hint text, and the `maxlength`
  attribute on the input are all driven by these two fields per design.
  The text itself isn't otherwise filtered (any character the customer
  types is accepted), just trimmed and uppercased to match the kiosk's
  all-caps styling. Because length is now unbounded per design, both the
  live preview and the final rasterized image auto-shrink the font size
  to fit whatever was typed inside the zone - measured against the
  actual rendered pixel dimensions, not a fixed lookup table - so a short
  monogram and a long name both render correctly sized without overflowing.

The Design ID is auto-generated by slugifying the Name (same approach as
SKUs). Using "Edit" on an existing design updates its zone fields in
place and optionally replaces the artwork; the artwork can be
left as-is by not choosing a new file - replacing an SVG design with a
PNG (or vice versa) removes the old file and updates the record to
point at the new one. Deleting a design removes both its JSON record and
its artwork file - like Stores/SKUs, deletion is a separate, explicit
"Delete" action and never happens implicitly.

Design artwork lives under `DATA_DIR/design-assets/` (served at
`/design-assets/<id>.svg` or `.png`) rather than `public/`, for the same reason
Stores/SKUs live under `DATA_DIR`: it needs to survive redeploys on a
host with persistent disk. The seed data in `data/designs.json` +
`data/design-assets/` (the four built-in reference designs - Shear,
Halo, Grid, Fold) is only used to populate the dataset the first time the
app runs against an empty `DATA_DIR`; after that, everything is
admin-managed.

## Orders

Every finalized order (after the customer fills in the Customer Info
screen) is appended to `data/orders.json` regardless of whether the
print-provider email succeeded or failed, and includes an `emailStatus`
field (`sent` / `failed`) so a failed send is still visible for
follow-up. The admin dashboard's Orders section shows a live table of
every order, and "Export orders" downloads an `.xlsx` for a given date
range (inclusive, matched against the order's timestamp) with every
field - reference ID, store/SKU/design/customization text, the
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

## Adding real SKUs and designs

- SKUs are no longer static config - manage them from the admin
  dashboard's SKUs section (see "Excel upload / merge behavior" above).
  The seed data in `data/skus.json` ships with the real HP India laptop
  catalog (59 verified models) and is only used to populate the dataset
  the very first time the app runs against an empty `DATA_DIR`.
- Designs are no longer static config either - manage them from the admin
  dashboard's Designs section (see "Designs" above). The artwork itself
  is a fixed, static image - only the customer's customization text picks
  up the colour and Google Font locked in for that design (see "Designs").

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
`data/stores.json`/`data/skus.json`/`data/designs.json`/
`data/design-assets/` back to their placeholder seed (and wipe
`data/orders.json` entirely) on every restart or redeploy, discarding
every admin-uploaded store/SKU/design and every placed order.

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
  existing `stores.json`/`skus.json`/`designs.json` at that path, the app
  copies the seed data (and seed design artwork) from the repo so the
  kiosk is usable immediately; `orders.json` always starts empty (there's
  nothing to seed - it's real order history). After first boot, only the
  admin dashboard (Excel upload for stores/SKUs, the Designs form, or a
  manual edit) changes stores/SKUs/designs, and orders are appended
  automatically as customers check out. Because seeding only happens when
  the file doesn't exist yet, redeploying with a newer seed in the repo
  (e.g. a refreshed SKU catalog) does **not** overwrite what's already on
  the disk - re-upload the new data through the admin dashboard instead.

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
