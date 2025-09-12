import { probeUrl } from "../services/probe.service.js";
import { decidePlayback } from "../services/decision.service.js";

export async function prepareController(req, res) {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  try {
    const meta = await probeUrl(url);
    const formatName = meta.format?.format_name || "";
    const decision = decidePlayback(meta.streams, formatName);

    if (decision.mode === "direct") {
      const playbackUrl = `/proxy?url=${encodeURIComponent(url)}`;
      return res.json({ ok: true, mode: "direct", playbackUrl, meta: summarize(meta) });
    }

    if (decision.mode === "remux") {
      const playbackUrl = `/stream/remux.mp4?url=${encodeURIComponent(url)}`;
      return res.json({ ok: true, mode: "remux", playbackUrl, meta: summarize(meta) });
    }

    return res.json({
      ok: true,
      mode: "hls",
      message: "Not browser-compatible container/codecs. HLS packaging needed."
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

function summarize(meta) {
  return {
    duration: meta.format?.duration,
    size: meta.format?.size,
    bit_rate: meta.format?.bit_rate,
    video: meta.streams.filter(s => s.codec_type === "video").map(s => ({
      codec: s.codec_name, width: s.width, height: s.height
    })),
    audio: meta.streams.filter(s => s.codec_type === "audio").map(s => ({
      codec: s.codec_name, channels: s.channels, sample_rate: s.sample_rate
    }))
  };
}
