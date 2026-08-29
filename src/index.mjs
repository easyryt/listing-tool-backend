import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import multer from "multer";

import connectDatabase from "./config/db.mjs";
import productRoutes from "./routes/products.mjs";
import charmRoutes from "./routes/charms.mjs";
import designRoutes from "./routes/designs.mjs";

/*
|--------------------------------------------------------------------------
| DNS
|--------------------------------------------------------------------------
*/

dns.setServers([
  "8.8.8.8",
  "1.1.1.1",
]);

/*
|--------------------------------------------------------------------------
| App
|--------------------------------------------------------------------------
*/

const app = express();

const currentDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);

const port =
  Number(process.env.PORT) || 5000;

/*
|--------------------------------------------------------------------------
| Public CORS
|--------------------------------------------------------------------------
|
| This API is intentionally public. The wildcard allows the production
| Vercel domain, Vercel preview deployments, localhost, mobile apps, and
| other websites to call the API without maintaining an origin allowlist.
|
| credentials must remain false when origin is "*".
| Omitting allowedHeaders lets the CORS middleware reflect all headers
| requested by the browser during preflight.
|--------------------------------------------------------------------------
*/

const corsOptions = {
  origin: "*",

  methods: [
    "GET",
    "POST",
    "PATCH",
    "PUT",
    "DELETE",
    "OPTIONS",
  ],

  credentials: false,

  optionsSuccessStatus: 204,

  maxAge: 86400,
};

app.use(
  cors(corsOptions),
);

console.log(
  "CORS access: public (*)",
);

/*
|--------------------------------------------------------------------------
| JSON
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: "2mb",
  }),
);

/*
|--------------------------------------------------------------------------
| Listing dashboard
|--------------------------------------------------------------------------
*/

app.use(
  express.static(
    path.join(
      currentDirectory,
      "../public",
    ),
  ),
);

/*
|--------------------------------------------------------------------------
| Request Logger
|--------------------------------------------------------------------------
*/

app.use(
  (
    request,
    _response,
    next,
  ) => {
    console.log(
      `[${new Date().toISOString()}] ${request.method} ${request.originalUrl}`,
    );

    next();
  },
);

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get(
  "/api/health",
  (
    _request,
    response,
  ) => {
    response.json({
      success: true,

      status: "ok",

      database:
        mongoose.connection
          .readyState === 1
          ? "connected"
          : "disconnected",

      uptime:
        process.uptime(),

      timestamp:
        new Date().toISOString(),

      cors: {
        access: "public",
        origin: "*",
        credentials: false,
      },
    });
  },
);

/*
|--------------------------------------------------------------------------
| Products
|--------------------------------------------------------------------------
*/

app.use(
  "/api/products",
  productRoutes,
);

app.use(
  "/api/charms",
  charmRoutes,
);

app.use(
  "/api/designs",
  designRoutes,
);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use(
  (
    request,
    response,
  ) => {
    response
      .status(404)
      .json({
        success: false,

        message:
          `Route not found: ${request.method} ${request.originalUrl}`,
      });
  },
);

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use(
  (
    error,
    _request,
    response,
    _next,
  ) => {
    console.error(
      "API ERROR:",
      error,
    );

    /*
    |--------------------------------------------------------------------------
    | Custom Application Errors
    |--------------------------------------------------------------------------
    */

    if (error.status) {
      return response
        .status(error.status)
        .json({
          success: false,

          message:
            error.message ||
            "Request failed.",
        });
    }

    if (error instanceof multer.MulterError) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "The spreadsheet must be 15 MB or smaller."
              : "Invalid spreadsheet upload.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Mongoose Validation
    |--------------------------------------------------------------------------
    */

    if (
      error.name ===
      "ValidationError"
    ) {
      return response
        .status(400)
        .json({
          success: false,

          message:
            error.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Invalid ObjectId
    |--------------------------------------------------------------------------
    */

    if (
      error.name ===
      "CastError"
    ) {
      return response
        .status(400)
        .json({
          success: false,

          message:
            `Invalid ${error.path}.`,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Duplicate MongoDB Key
    |--------------------------------------------------------------------------
    */

    if (
      error.code === 11000
    ) {
      return response
        .status(409)
        .json({
          success: false,

          message:
            "A duplicate product value was detected.",

          fields:
            error.keyValue ||
            {},
        });
    }

    /*
    |--------------------------------------------------------------------------
    | MongoDB unavailable
    |--------------------------------------------------------------------------
    */

    if (
      error.name ===
        "MongoServerSelectionError" ||
      error.name ===
        "MongoNetworkError"
    ) {
      return response
        .status(503)
        .json({
          success: false,

          message:
            "MongoDB is currently unavailable.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Unknown Error
    |--------------------------------------------------------------------------
    */

    return response
      .status(500)
      .json({
        success: false,

        message:
          "Something went wrong on the server.",
      });
  },
);

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/

async function startServer() {
  try {
    await connectDatabase();

    app.listen(
      port,
      "0.0.0.0",
      () => {
        console.log("");
        console.log(
          "========================================",
        );
        console.log(
          `API running on port ${port}`,
        );
        console.log(
          `Products: /api/products`,
        );
        console.log(
          `Dashboard: /api/products/dashboard`,
        );
        console.log(
          "CORS: public (*)",
        );
        console.log(
          "========================================",
        );
        console.log("");
      },
    );
  } catch (error) {
    console.error(
      "Unable to start API:",
      error,
    );

    process.exit(1);
  }
}

startServer();

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/

async function shutdown(
  signal,
) {
  console.log(
    `${signal} received. Closing MongoDB...`,
  );

  try {
    await mongoose.connection.close();

    console.log(
      "MongoDB connection closed.",
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "Shutdown error:",
      error,
    );

    process.exit(1);
  }
}

process.on(
  "SIGINT",
  () =>
    void shutdown(
      "SIGINT",
    ),
);

process.on(
  "SIGTERM",
  () =>
    void shutdown(
      "SIGTERM",
    ),
);
