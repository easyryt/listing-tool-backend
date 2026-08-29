import mongoose from "mongoose";

import { initializeDesignLibrary } from "../services/design-library.mjs";

export default async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  const databaseName =
    String(
      process.env.MONGODB_DB_NAME ||
        "listing_tool",
    ).trim();

  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  if (!/^[A-Za-z0-9_-]{1,63}$/.test(databaseName)) {
    throw new Error("MONGODB_DB_NAME contains invalid characters.");
  }

  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => {
    console.log(
      `MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`,
    );
  });

  mongoose.connection.on("error", (error) => {
    console.error(
      "MongoDB connection error:",
      error.message,
    );
  });

  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB disconnected.");
  });

  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    minPoolSize: 1,
    family: 4,
  });

  await initializeDesignLibrary();
}
