"use strict";
/*
 * Server tĩnh nhỏ cho game Đập Chuột — chỉ dùng module có sẵn của Node.js.
 *   /            → các file trong app/
 *   /design/...  → các file trong design/ (app/index.html nạp ../design/tokens.css)
 *   /healthz     → kiểm tra sức khoẻ cho Docker
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const DESIGN_DIR = path.join(ROOT, "design");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

/* Đổi đường dẫn URL thành file thật, không cho thoát ra ngoài thư mục gốc */
function resolveFile(urlPath) {
  let base = APP_DIR;
  let rel = urlPath;
  if (rel === "/design" || rel.startsWith("/design/")) {
    base = DESIGN_DIR;
    rel = rel.slice("/design".length) || "/";
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(base, "." + rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on("finish", () => log(req.method, req.url, res.statusCode, Date.now() - started + "ms"));

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }
  if (urlPath.includes("\0")) return send(res, 400, "Bad Request");

  if (urlPath === "/healthz") return send(res, 200, "ok");
  // Game không có biểu tượng tab: trả rỗng để trình duyệt không báo lỗi 404
  if (urlPath === "/favicon.ico") {
    res.writeHead(204, { "Cache-Control": "max-age=86400" });
    return res.end();
  }

  const file = resolveFile(urlPath);
  if (!file) return send(res, 403, "Forbidden");

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Không tìm thấy trang");
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  log(`Đập Chuột đang chạy tại http://localhost:${PORT}`);
});

function shutdown(signal) {
  log(`Nhận ${signal}, đang dừng server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
