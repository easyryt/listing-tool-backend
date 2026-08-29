import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/generate-listing-options.mjs <source.xlsx> <output.json>",
  );
}

const workbook = XLSX.readFile(path.resolve(inputPath));
const sheetName = workbook.SheetNames.find((name) =>
  /validation/i.test(name),
);

if (!sheetName) {
  throw new Error("The workbook does not contain a Validation Sheet.");
}

const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
  header: 1,
  defval: "",
  raw: false,
  blankrows: true,
});
const headerRow = rows.find((row) =>
  row.some((value) => String(value).trim() === "Compatible Models"),
);

if (!headerRow) {
  throw new Error("Compatible Models was not found in the Validation Sheet.");
}

const categoryIndex = headerRow.findIndex(
  (value) => String(value).trim() === "Generic Name",
);
const modelIndex = headerRow.findIndex(
  (value) => String(value).trim() === "Compatible Models",
);

if (categoryIndex < 0 || modelIndex < 0) {
  throw new Error("Generic Name or Compatible Models is missing.");
}

function uniqueColumnValues(columnIndex) {
  const values = rows
    .slice(rows.indexOf(headerRow) + 2)
    .map((row) => String(row[columnIndex] ?? "").trim())
    .filter(Boolean);
  const uniqueValues = [...new Set(values)];

  if (values.length !== uniqueValues.length) {
    throw new Error(`Column ${columnIndex + 1} contains duplicate options.`);
  }

  return uniqueValues;
}

const categories = uniqueColumnValues(categoryIndex);
const compatibleModels = uniqueColumnValues(modelIndex);

if (!categories.length || !compatibleModels.length) {
  throw new Error("The workbook option columns are empty.");
}

const resolvedOutputPath = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(
  resolvedOutputPath,
  `${JSON.stringify({ categories, compatibleModels }, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    output: resolvedOutputPath,
    categoryCount: categories.length,
    compatibleModelCount: compatibleModels.length,
  }),
);
