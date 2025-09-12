import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import fs from "fs";
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
// --- Dynamic HLS playlist generation middleware ---
app.get("/stream/hls/:sessionId/master.m3u8", (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.resolve(hlsRoot, sessionId);
  const masterPath = path.resolve(sessionDir, "master.m3u8");
  
  // Try to serve existing playlist first (but only if it contains actual segments)
  if (fs.existsSync(masterPath)) {
    const content = fs.readFileSync(masterPath, 'utf8');
    // Only serve cached playlist if it contains actual segment entries (has .ts or .m4s files listed)
    if (content.includes('.ts') || content.includes('.m4s')) {
      return res.sendFile(masterPath);
    }
    // Otherwise, regenerate from segments
  }
  
  // Generate playlist from existing segments
  try {
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ ok: false, error: "Session not found" });
    }
    
    const files = fs.readdirSync(sessionDir);
    const segments = files.filter(f => f.endsWith('.ts') || f.endsWith('.m4s')).sort();
    
    if (segments.length === 0) {
      // Return a placeholder playlist that HLS.js can handle
      const placeholder = [
        "#EXTM3U",
        "#EXT-X-VERSION:3", 
        "#EXT-X-TARGETDURATION:4",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "# Loading segments..."
      ].join("\n");
      
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      return res.send(placeholder);
    }
    
    // Check if conversion is complete
    const isComplete = fs.existsSync(path.resolve(sessionDir, "conversion_complete.marker"));
    
    // Calculate proper media sequence from first segment number
    const firstSegment = segments[0];
    const mediaSequence = firstSegment ? parseInt(firstSegment.match(/seg_(\d+)/)?.[1] || 0) : 0;
    
    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:4", 
      "#EXT-X-PLAYLIST-TYPE:EVENT",  // Event type allows continuous updates
      `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`,
      ...segments.map(seg => `#EXTINF:4.0,\n${seg}`),
      // Only add ENDLIST when conversion is complete
      ...(isComplete ? ["#EXT-X-ENDLIST"] : [])
    ].join("\n");
    
    // Cache the generated playlist (but not for incomplete streams)
    if (isComplete) {
      fs.writeFileSync(masterPath, playlist);
    }
    
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", isComplete ? "max-age=60" : "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.send(playlist);
    
  } catch (error) {
    console.error("Error generating playlist:", error);
    res.status(500).json({ ok: false, error: "Failed to generate playlist" });
  }
});

// --- Static for HLS segments *after* dynamic playlist ---  
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
