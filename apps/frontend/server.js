import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.join(__dirname, "web");

const mimeTypeByExtension = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

/**
 * Lightweight static server for the portal UI.
 */
const server = http.createServer((req, res) => {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.normalize(path.join(webRoot, requestPath));

  // Prevent directory traversal outside the web root.
  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const extension = path.extname(filePath);
    // Serve known web asset types with secure defaults.
    res.writeHead(200, {
      "Content-Type": mimeTypeByExtension[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
});

const port = Number(process.env.PORT || 3000);
// Starts the frontend static server.
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`frontend listening on http://0.0.0.0:${port}\n`);
});
