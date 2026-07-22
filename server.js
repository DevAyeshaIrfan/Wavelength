const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Normalize URL path
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security check to prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const totalSize = stats.size;

    // Handle HTTP Range Requests for MP3 Streaming & Seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.writeHead(416, {
          "Content-Range": `bytes */${totalSize}`
        });
        res.end();
        return;
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes"
      });

      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n==================================================`);
  console.log(`🎵 Spotify Clone Streaming Server is LIVE!`);
  console.log(`👉 Access URL: http://localhost:${PORT}`);
  console.log(`👉 Network URL: http://127.0.0.1:${PORT}`);
  console.log(`==================================================\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Port ${PORT} in use, trying 8080...`);
    server.listen(8080, "0.0.0.0");
  } else {
    console.error("Server error:", err);
  }
});
