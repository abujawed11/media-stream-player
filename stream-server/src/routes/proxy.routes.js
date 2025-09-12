import { Router } from "express";

const router = Router();

router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "Missing ?url=" });

  try {
    const headers = {
      // Send a stable browser UA + referer from env (Seedr may require it)
      "user-agent": process.env.HTTP_USER_AGENT || req.headers["user-agent"] || "Mozilla/5.0",
      "referer": process.env.HTTP_REFERER || "https://www.seedr.cc/",
      "accept": process.env.HTTP_ACCEPT || "*/*",
      "accept-language": process.env.HTTP_ACCEPT_LANGUAGE || "en-US,en;q=0.9",
      "connection": "keep-alive",
    };

    // Forward Range for seeking
    if (req.headers.range) headers["range"] = req.headers.range;

    const upstream = await fetch(url, { method: "GET", headers });

    res.status(upstream.status);
    upstream.headers.forEach((v, k) => {
      if (!["transfer-encoding"].includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    });

    if (!upstream.body) return res.end();

    const reader = upstream.body.getReader();
    const pump = () =>
      reader.read().then(({ done, value }) => {
        if (done) return res.end();
        res.write(value);
        return pump();
      });
    pump().catch(() => res.end());
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
