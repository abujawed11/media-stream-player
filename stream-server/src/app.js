import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import router from "./routes/index.js";
import { ensureDirSync } from "./utils/files.js";
import { hlsAccessMiddleware } from "./middlewares/hlsAccess.middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hlsRoot = path.resolve(__dirname, "../storage/segments/hls");
ensureDirSync(hlsRoot);
console.log("[HLS static root]", hlsRoot);

const app = express();

// --- Core middlewares ---
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS (choose ONE of these styles)
// 1) Dev-friendly wildcard (no cookies):
app.use(cors({ origin: "*", credentials: false }));
// 2) OR reflect request origin with credentials (cookies):
// app.use(cors({ origin: true, credentials: true }));

app.use(morgan("dev"));
app.use(hlsAccessMiddleware);
// --- Static for HLS *before* routes/404 ---
app.use("/stream/hls", express.static(hlsRoot, {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", env.CORS_ORIGINS || "*");
  }
}));

// --- API routes ---
app.use("/", router);

// --- 404 (after static + routes) ---
app.use((req, res) => {
  return res.status(404).json({ ok: false, error: "Not Found" });
});

// --- Global error handler (last) ---
app.use((err, req, res, next) => {
  logger.error({ err }, "Unhandled error");
  const status = err.status || 500;
  return res.status(status).json({ ok: false, error: err.message || "Server error" });
});

export default app;
