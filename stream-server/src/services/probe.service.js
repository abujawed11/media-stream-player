import ffmpeg from "fluent-ffmpeg";

function headerLines() {
  const lines = [];
  if (process.env.HTTP_REFERER) lines.push(`Referer: ${process.env.HTTP_REFERER}`);
  if (process.env.HTTP_ACCEPT) lines.push(`Accept: ${process.env.HTTP_ACCEPT}`);
  if (process.env.HTTP_ACCEPT_LANGUAGE) lines.push(`Accept-Language: ${process.env.HTTP_ACCEPT_LANGUAGE}`);
  // Some CDNs care about connection hints
  lines.push("Connection: keep-alive");
  return lines;
}

export async function probeUrl(url) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(url)
      .inputOptions([
        // User-Agent
        ...(process.env.HTTP_USER_AGENT ? ["-user_agent", process.env.HTTP_USER_AGENT] : []),
        // Custom headers (each line ends with \r\n per ffmpeg docs, fluent-ffmpeg handles it fine as separate -headers args)
        ...headerLines().flatMap(h => ["-headers", h]),
        // Reasonable timeouts (in microseconds)
        "-rw_timeout", String(15 * 1000 * 1000),  // 15s read/write timeout
        "-timeout", String(15 * 1000 * 1000),
      ]);

    cmd.ffprobe((err, data) => {
      if (err) return reject(err);
      const { format = {}, streams = [] } = data || {};
      resolve({ format, streams, raw: data });
    });
  });
}
