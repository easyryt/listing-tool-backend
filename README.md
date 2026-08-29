# Listing Tool API

Standalone Node.js, Express, and MongoDB API for the listing tool.

## Run locally

1. Copy `.env.example` to `.env` and replace `<password>` with the password for your MongoDB Atlas database user. URL-encode special characters in the password.
2. Install and start the API:

```bash
npm install
npm run dev
```

The API starts at `http://localhost:5000`. Check it at `GET /api/health`.
Open `http://localhost:5000` in a browser for the product-import dashboard.

## Deploy to Render

Create a **Web Service** from this repository and configure:

| Render setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Add these Render environment variables:

| Key | Value |
| --- | --- |
| `MONGODB_URI` | Your complete MongoDB Atlas connection string, with the real password |
| `MONGODB_DB_NAME` | Database name. Use `listing_tool` (the application default). |
| `CLIENT_ORIGIN` | Not required. The API currently uses public wildcard CORS. |

Render provides `PORT` automatically. Do not add a real `.env` file to Git.

## Move data out of the default `test` database

When `MONGODB_URI` does not contain a database name, MongoDB uses `test`.
This project now explicitly uses `listing_tool`. Before deploying this change,
copy the existing collections with the included non-destructive migration:

```bash
npm run db:migrate
npm run db:migrate -- --apply
```

The first command only displays source and target counts. The second copies
documents and indexes, verifies every collection count, and leaves `test`
untouched as a rollback copy. Set `MONGODB_SOURCE_DB_NAME` only if the old
database is not `test`.

After deployment, use `https://your-render-service.onrender.com/api` as the API base URL. Add that value to Vercel as `NEXT_PUBLIC_API_URL` when connecting the frontend.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | API and database status |
| `GET` | `/api/products` | List products and variants |
| `POST` | `/api/products` | Create a product or variant |
| `POST` | `/api/products/import` | Import or refresh products from a Meesho/legacy Excel file |
| `POST` | `/api/products/:id/with-charm` | Copy a product into the separate charms collection |
| `GET` | `/api/products/:id/charms` | List all charms sharing the product's Design Number |
| `DELETE` | `/api/products/:id/charms/:charmId` | Delete a related charm without changing the product |
| `PATCH` | `/api/products/:id/charms/:charmId` | Update editable charm fields without changing the product |
| `GET` | `/api/charms?designNumber=317` | List separately stored charms for a design number |
| `POST` | `/api/charms` | Create a charm directly in the separate charms collection |
| `PATCH` / `DELETE` | `/api/charms/:id` | Update or delete a charm without touching products |
| `GET` | `/api/products/:id` | Get one product |
| `PATCH` | `/api/products/:id` | Update a product or variant |
| `DELETE` | `/api/products/:id` | Delete a product; deleting a parent also removes its variants |

## Import products from Excel

Send a `multipart/form-data` request to `POST /api/products/import` with the
spreadsheet in the `file` field. `.xlsx`, `.xls`, and `.csv` files up to 15 MB
are supported. The importer finds the product table by its column headings, so
it accepts both the current Meesho template and older listing files. It maps
the product details, pricing, images, SKU, compatible model, and manufacturer
details into MongoDB automatically.

Rows are matched by SKU: a new SKU creates a product, while an already-saved
SKU is updated. The response includes imported, updated, and failed-row totals
plus up to 100 row errors, so a partly-invalid spreadsheet does not discard
the valid listings.

SKU versions are imported as one product family. `V1` is the parent product;
`V2`, `V3`, and later versions are attached as variants with the same Design
Number. For a SKU such as
`MBRO-MC-AP-IP11-UVV-CUTPNRBCT-WL-TRNSPT-268.1.V1`, the importer stores
`UVV` as Print Type, `CUTPNRBCT` as Design Code, and `WL` as Finish. It also
copies Generic Name to Category and Manufacturer Name to Brand. Every
populated product field is imported, including Wrong/Defective Returns Price
and Product ID / Style ID; Meesho's system-only error columns are ignored.
Other blank cells remain blank instead of receiving generated values.

The same upload endpoint accepts a workbook containing a `design name` sheet.
Each row's SKU family is parsed into a Design Code and stored as a reusable
Design library record together with its Design Name, model, collection, Design
Number, Print Type, Finish, and reference SKU. Product imports then match their
SKU-derived Design Code to this library and store both `designId` and
`designName`. For example, `CUTPNRBCT` resolves to `Cute Pink Ribbon Cat`.
Importing the design library also backfills matching products that are already
stored in MongoDB, so the product workbook does not need to be uploaded again.
Free-text Design Name cells in listing sheets are not trusted: the saved
code-to-name library is the authoritative source. A product family whose
Design Code is missing from the library is rejected with row-level errors
instead of being stored with an empty or guessed Design Name.

```bash
curl -X POST http://localhost:5000/api/products/import \
  -F "file=@listing.xlsx"
```

The same import flow is available in the dashboard. It displays every saved
product in a searchable, paginated table with image, SKU, compatible model,
price, MRP, stock, group, and import date.

## Create a with-charms product

Send a `POST` request to `/api/products/:id/with-charm`, where `:id` is the
original product ID. The new charm copies all fields (images, price, phone
models, inventory details, and so on), is saved in the separate MongoDB
`charms` collection, and always uses the original product's Design Number.
The original product is not updated and no Product variant is created.

The charm page displays the parent and all of its variants. A charm can be
generated from any individual row or from all missing rows at once. Generated
drafts and stored charms use a horizontally scrollable editable table. The
shared Design Number stays locked so every charm remains connected to the
correct design; saving an edited charm never updates its source product.

You may omit the body to use generated “With Charms” values, or send exact
replacement values from the form. `title` is accepted as an alias for
`productName`.

```json
{
  "designName": "Aesthetic Pastel Floral With Charms",
  "sku": "MC-AP-IP13-UVV-APF-WL-TRNSPT-WITH CHRM-117.1.V1",
  "title": "Premium Crystal Clear Silicon Back Cover with Elegant Aesthetic Pastel Floral With Charms Print"
}
```
