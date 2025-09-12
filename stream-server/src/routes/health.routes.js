import { Router } from "express";
import ffmpeg from "fluent-ffmpeg";

const router = Router();

router.get("/", (req, res) => res.json({ ok: true, status: "healthy" }));

router.get("/ffmpeg", (req, res) => {
  // Quick ffmpeg presence check
  try {
    ffmpeg.getAvailableFormats((err) => {
      if (err) return res.status(500).json({ ok: false, ffmpeg: false, error: String(err) });
      return res.json({ ok: true, ffmpeg: true });
    });
  } catch (e) {
    return res.status(500).json({ ok: false, ffmpeg: false, error: String(e) });
  }
});

export default router;
