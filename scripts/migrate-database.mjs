import "dotenv/config";

import dns from "node:dns";
import mongoose from "mongoose";

dns.setServers([
  "8.8.8.8",
  "1.1.1.1",
]);

const APPLY = process.argv.includes("--apply");
const MERGE = process.argv.includes("--merge");
const BATCH_SIZE = 500;

function databaseName(value, fallback) {
  const name = String(value || fallback).trim();

  if (!/^[A-Za-z0-9_-]{1,63}$/.test(name)) {
    throw new Error(
      `Invalid MongoDB database name: ${name || "<empty>"}. ` +
        "Use only letters, numbers, underscores, or hyphens.",
    );
  }

  return name;
}

const sourceName = databaseName(
  process.env.MONGODB_SOURCE_DB_NAME,
  "test",
);
const targetName = databaseName(
  process.env.MONGODB_DB_NAME,
  "listing_tool",
);

if (sourceName === targetName) {
  throw new Error("Source and target database names must be different.");
}

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not set.");
}

function indexOptions(index) {
  const allowed = [
    "name",
    "unique",
    "sparse",
    "expireAfterSeconds",
    "partialFilterExpression",
    "collation",
    "hidden",
    "wildcardProjection",
  ];

  return Object.fromEntries(
    allowed
      .filter((key) => index[key] !== undefined)
      .map((key) => [key, index[key]]),
  );
}

async function inventory(database, names) {
  return Promise.all(
    names.map(async (name) => ({
      name,
      count: await database.collection(name).countDocuments({}),
    })),
  );
}

async function copyCollection(sourceDatabase, targetDatabase, name) {
  const source = sourceDatabase.collection(name);
  const target = targetDatabase.collection(name);
  let operations = [];
  let copied = 0;

  for await (const document of source.find({}).batchSize(BATCH_SIZE)) {
    operations.push({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true,
      },
    });

    if (operations.length === BATCH_SIZE) {
      await target.bulkWrite(operations, { ordered: false });
      copied += operations.length;
      operations = [];
    }
  }

  if (operations.length) {
    await target.bulkWrite(operations, { ordered: false });
    copied += operations.length;
  }

  const indexes = await source.indexes();

  for (const index of indexes) {
    if (index.name === "_id_") continue;
    await target.createIndex(index.key, indexOptions(index));
  }

  return {
    copied,
    indexes: Math.max(0, indexes.length - 1),
  };
}

const client = new mongoose.mongo.MongoClient(uri, {
  serverSelectionTimeoutMS: 10_000,
  maxPoolSize: 5,
  family: 4,
});

try {
  await client.connect();

  const sourceDatabase = client.db(sourceName);
  const targetDatabase = client.db(targetName);
  const sourceCollections = (
    await sourceDatabase.listCollections({}, { nameOnly: true }).toArray()
  )
    .filter(
      (collection) =>
        collection.type === "collection" &&
        !collection.name.startsWith("system."),
    )
    .map((collection) => collection.name)
    .sort();

  if (!sourceCollections.length) {
    throw new Error(`Source database "${sourceName}" has no collections.`);
  }

  const sourceInventory = await inventory(
    sourceDatabase,
    sourceCollections,
  );
  const targetInventory = await inventory(
    targetDatabase,
    sourceCollections,
  );

  console.log(`MongoDB database migration: ${sourceName} -> ${targetName}`);
  console.table(
    sourceInventory.map((source, index) => ({
      collection: source.name,
      sourceDocuments: source.count,
      targetDocuments: targetInventory[index].count,
    })),
  );

  if (!APPLY) {
    console.log(
      "Dry run only. Run `npm run db:migrate -- --apply` to copy the data.",
    );
  } else {
    const targetDocumentCount = targetInventory.reduce(
      (total, collection) => total + collection.count,
      0,
    );

    if (targetDocumentCount > 0 && !MERGE) {
      throw new Error(
        `Target database "${targetName}" is not empty. ` +
          "Use --merge only after reviewing both inventories.",
      );
    }

    for (const collection of sourceInventory) {
      const result = await copyCollection(
        sourceDatabase,
        targetDatabase,
        collection.name,
      );
      console.log(
        `${collection.name}: copied ${result.copied} documents and ${result.indexes} indexes.`,
      );
    }

    const verifiedTarget = await inventory(
      targetDatabase,
      sourceCollections,
    );
    const mismatches = sourceInventory.filter(
      (source, index) => source.count !== verifiedTarget[index].count,
    );

    console.table(
      sourceInventory.map((source, index) => ({
        collection: source.name,
        sourceDocuments: source.count,
        targetDocuments: verifiedTarget[index].count,
        verified: source.count === verifiedTarget[index].count,
      })),
    );

    if (mismatches.length) {
      throw new Error(
        `Verification failed for: ${mismatches.map((item) => item.name).join(", ")}.`,
      );
    }

    console.log(
      `Migration verified. The original "${sourceName}" database was not deleted.`,
    );
  }
} finally {
  await client.close();
}
