import mongoose from "mongoose";

import { initializeDesignLibrary } from "../services/design-library.mjs";

export default async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => {
    console.log(
      `MongoDB connected: ${mongoose.connection.host}`,
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
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    minPoolSize: 1,
    family: 4,
  });

  await initializeDesignLibrary();
}
