"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { randomUUID } = require("node:crypto");
const { v2: cloudinary } = require("cloudinary");

const app = express();

const PORT = Number(process.env.PORT || 5000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// --------------------------------------------------
// Environment validation
// --------------------------------------------------

const REQUIRED_ENV = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]?.trim()) {
    console.error(`[config] Missing environment variable: ${key}`);
    process.exit(1);
  }
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("[config] PORT must be a valid port number.");
  process.exit(1);
}

if (IS_PRODUCTION && !process.env.FRONTEND_ORIGINS?.trim()) {
  console.error(
    "[config] Set FRONTEND_ORIGINS to your frontend website origin.",
  );
  process.exit(1);
}

const ALLOWED_ORIGINS = (
  process.env.FRONTEND_ORIGINS || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

// Set only when you know the trusted proxy count at your host.
if (process.env.TRUST_PROXY_HOPS) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);

  if (!Number.isInteger(hops) || hops < 1) {
    console.error(
      "[config] TRUST_PROXY_HOPS must be a positive integer.",
    );
    process.exit(1);
  }

  app.set("trust proxy", hops);
}

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin include health checks and CLI clients.
      // CORS controls browser access; it does not authenticate clients.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error(
        "This website is not allowed to access the upload service.",
      );

      error.status = 403;
      return callback(error);
    },

    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: "16kb" }));

// --------------------------------------------------
// Cloudinary
// --------------------------------------------------

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// --------------------------------------------------
// Upload configuration
// --------------------------------------------------

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 2,
  },

  fileFilter(_req, file, callback) {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error(
        "Choose a JPG, PNG, WEBP, HEIC or HEIF image.",
      );

      error.status = 415;
      return callback(error);
    }

    return callback(null, true);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  message: {
    error:
      "Too many uploads. Please try again in 15 minutes or contact the pharmacy on WhatsApp.",
  },
});

// Limit simultaneous uploads on this server instance.
let activeUploads = 0;
const MAX_ACTIVE_UPLOADS = 8;

function reserveUploadSlot(_req, res, next) {
  if (activeUploads >= MAX_ACTIVE_UPLOADS) {
    res.setHeader("Retry-After", "10");

    return res.status(503).json({
      error: "Upload service is busy. Please try again shortly.",
    });
  }

  activeUploads += 1;

  let released = false;

  function release() {
    if (released) return;

    released = true;
    activeUploads -= 1;
  }

  res.once("finish", release);
  res.once("close", release);

  next();
}

// Basic signature screening; Cloudinary also processes the actual image.
function hasSupportedImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }

  // JPEG
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return true;
  }

  // PNG
  const pngSignature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  if (buffer.subarray(0, 8).equals(pngSignature)) {
    return true;
  }

  // WEBP
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }

  // HEIC / HEIF
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brands = buffer.toString(
      "ascii",
      8,
      Math.min(buffer.length, 64),
    );

    return /heic|heix|hevc|hevx|mif1|msf1/.test(brands);
  }

  return false;
}

// --------------------------------------------------
// Health routes
// --------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    service: "Goregaonmeds Upload API",
    status: "ok",
    health: "/api/health",
  });
});

app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");

  res.json({
    status: "ok",
    message: "Goregaonmeds backend is running.",
  });
});

// --------------------------------------------------
// Prescription upload
// Frontend sends: FormData with field name "image"
// Response: { url: "https://..." }
// --------------------------------------------------

app.post(
  "/api/upload",
  uploadLimiter,
  reserveUploadSlot,
  upload.single("image"),
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");

    if (!req.file) {
      return res.status(400).json({
        error: "Please attach a prescription image.",
      });
    }

    if (!hasSupportedImageSignature(req.file.buffer)) {
      return res.status(415).json({
        error:
          "This file is not a supported image. Please select a valid photo.",
      });
    }

    try {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "goregaonmeds/prescriptions",
          public_id: randomUUID(),
          resource_type: "image",
          allowed_formats: [
            "jpg",
            "jpeg",
            "png",
            "webp",
            "heic",
            "heif",
          ],
          overwrite: false,
          timeout: 60000,

          // Preserve the original prescription:
          // no resizing or lossy quality transformations.
          //
          // Returned URLs are shareable, not private authenticated
          // medical storage. Configure retention/deletion separately.
        },
        (error, result) => {
          if (res.headersSent || res.destroyed) return;

          if (error || !result?.secure_url) {
            console.error("[upload] Cloudinary upload failed.", {
              code: error?.http_code || "NO_RESULT",
            });

            return res.status(502).json({
              error:
                "The image could not be uploaded. Please retry or send it directly on WhatsApp.",
            });
          }

          // Do not log prescription URLs or customer information.
          return res.status(201).json({
            url: result.secure_url,
          });
        },
      );

      stream.on("error", () => {
        if (res.headersSent || res.destroyed) return;

        res.status(502).json({
          error: "Upload interrupted. Please try again.",
        });
      });

      stream.end(req.file.buffer);
    } catch (error) {
      next(error);
    }
  },
);

// --------------------------------------------------
// Unknown routes
// --------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

// --------------------------------------------------
// Error handling
// --------------------------------------------------

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "Image is too large. Maximum size is 5 MB.",
      });
    }

    return res.status(400).json({
      error:
        "Attach one prescription image using the image field.",
    });
  }

  const status = [400, 403, 413, 415].includes(error.status)
    ? error.status
    : 500;

  if (status === 500) {
    console.error("[server] Unexpected request error.", {
      name: error.name || "Error",
    });
  }

  return res.status(status).json({
    error:
      status === 500
        ? "Something went wrong. Please try again."
        : error.message,
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`[server] Goregaonmeds API listening on port ${PORT}`);
    console.log(`[server] Health: http://localhost:${PORT}/api/health`);
  });

  server.requestTimeout = 90000;

  server.on("error", (error) => {
    console.error("[server] Could not start server:", error.message);
    process.exit(1);
  });

  let shuttingDown = false;

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("[server] Shutting down...");

    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

module.exports = app;
