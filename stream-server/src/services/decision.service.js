const VIDEO_OK = new Set(["h264", "avc1", "vp8", "vp9"]);
const AUDIO_OK = new Set(["aac", "mp4a", "opus"]);

export function decidePlayback(streams = [], formatName = "") {
  const vids = streams.filter(s => s.codec_type === "video");
  const auds = streams.filter(s => s.codec_type === "audio");

  const vOk = vids.length === 0 || vids.some(v => VIDEO_OK.has((v.codec_name || "").toLowerCase()));
  const aOk = auds.length === 0 || auds.some(a => AUDIO_OK.has((a.codec_name || "").toLowerCase()));

  // If codecs are OK but container is MKV, prefer remux (MP4) for browser compatibility
  const isMatroska = (formatName || "").toLowerCase().includes("matroska");

  if (vOk && aOk && !isMatroska) return { mode: "direct" };
  if (vOk && aOk && isMatroska)  return { mode: "remux" };

  // Otherwise we’ll need HLS/transcode
  return { mode: "hls" };
}
