import { Router } from "express";
import { prepareController } from "../controllers/stream.controller.js";
import { remuxMp4Controller } from "../controllers/remux.controller.js";
import { hlsStartController } from "../controllers/hls.controller.js";
import { hlsStartAbrController } from "../controllers/hls_abr.controller.js";
import { SessionService } from "../services/session.service.js";

const router = Router();

// Prepare decides direct/proxy/remux/hls/abr based on probe
router.post("/prepare", prepareController);

// Remux-on-the-fly MP4: GET /stream/remux.mp4?url=...
router.get("/remux.mp4", remuxMp4Controller);

// Single-variant HLS
router.post("/hls/start", hlsStartController);

// Multi-variant (ABR) HLS
router.post("/hls/start-abr", hlsStartAbrController);

// Stop + cleanup a session
router.post("/hls/stop/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const found = !!SessionService.get?.(sessionId);
  if (!found) return res.status(404).json({ ok: false, error: "Session not found", sessionId });

  const ok = SessionService.stop(sessionId);
  setTimeout(() => SessionService.deleteFolder(sessionId), 5_000);
  return res.json({ ok, sessionId });
});

// (Optional) quick status check
router.get("/hls/status/:sessionId", (req, res) => {
  const s = SessionService.get?.(req.params.sessionId);
  if (!s) return res.status(404).json({ ok: false, error: "Session not found" });
  return res.json({
    ok: true,
    sessionId: req.params.sessionId,
    status: s.status,
    startedAt: s.startedAt,
    lastAccessAt: s.lastAccessAt,
    outDir: s.outDir,
  });
});

export default router;

