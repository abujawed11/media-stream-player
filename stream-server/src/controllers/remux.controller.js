import ffmpeg from "fluent-ffmpeg";

// Build input header args to satisfy Seedr/CDN
function inputHeaders() {
  const hdrs = [];
  if (process.env.HTTP_USER_AGENT)      hdrs.push("User-Agent: " + process.env.HTTP_USER_AGENT);
  if (process.env.HTTP_REFERER)         hdrs.push("Referer: " + process.env.HTTP_REFERER);
  if (process.env.HTTP_ACCEPT)          hdrs.push("Accept: " + process.env.HTTP_ACCEPT);
  if (process.env.HTTP_ACCEPT_LANGUAGE) hdrs.push("Accept-Language: " + process.env.HTTP_ACCEPT_LANGUAGE);
  hdrs.push("Connection: keep-alive");
  return hdrs;
}

// GET /stream/remux.mp4?url=...
export async function remuxMp4Controller(req, res) {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "Missing ?url=" });

  // Set MP4 streaming-friendly headers
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  // Allow range-like seeking for fMP4 (we’ll fragment MP4)
  res.setHeader("Accept-Ranges", "bytes");

  try {
    const cmd = ffmpeg()
      .input(url)
      .inputOptions([
        ...(process.env.HTTP_USER_AGENT ? ["-user_agent", process.env.HTTP_USER_AGENT] : []),
        ...inputHeaders().flatMap(h => ["-headers", h]),
        "-rw_timeout", String(15 * 1000 * 1000),
        "-timeout", String(15 * 1000 * 1000),
      ])
      // Copy codecs (no re-encode). If audio/video somehow incompatible, we’ll handle via HLS later.
      .outputOptions([
        "-c:v copy",
        "-c:a copy",
        // Fragmented MP4 for instant playback & seeking
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4"
      ])
      .on("error", (err) => {
        if (!res.headersSent) res.status(500).json({ ok: false, error: String(err) });
        try { res.end(); } catch {}
      });

    const stream = cmd.pipe();
    stream.on("data", chunk => res.write(chunk));
    stream.on("end", () => res.end());
    stream.on("error", () => { try { res.end(); } catch {} });

  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ ok: false, error: String(err) });
    try { res.end(); } catch {}
  }
}
