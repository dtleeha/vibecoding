"use strict";
/*
 * Server cho game Đập Chuột.
 *   /             → các file trong app/
 *   /design/...   → các file trong design/ (app/index.html nạp ../design/tokens.css)
 *   /admin/...    → trang admin (admin/)
 *   /api/...      → API đăng ký, lưu điểm, admin (cần PostgreSQL)
 *   /healthz      → kiểm tra sức khoẻ cho Docker (không phụ thuộc database)
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");
const player = require("./api-player");
const admin = require("./api-admin");
const { HttpError, sendJson } = require("./http-utils");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "..");
const DIRS = {
  app: path.join(ROOT, "app"),
  design: path.join(ROOT, "design"),
  admin: path.join(ROOT, "admin"),
};

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

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};
// Chỉ cho phép tải file của chính trang (không chạy mã nhúng lạ)
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const log = db.log;

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache", ...SECURITY_HEADERS });
  res.end(body);
}

/* Đổi đường dẫn URL thành file thật, không cho thoát ra ngoài thư mục gốc */
function resolveFile(urlPath) {
  let base = DIRS.app;
  let rel = urlPath;
  for (const key of ["design", "admin"]) {
    if (rel === `/${key}` || rel.startsWith(`/${key}/`)) {
      base = DIRS[key];
      rel = rel.slice(key.length + 1) || "/";
      break;
    }
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(base, "." + rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

function serveStatic(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }
  if (urlPath === "/admin") {
    res.writeHead(301, { Location: "/admin/", ...SECURITY_HEADERS });
    return res.end();
  }
  const file = resolveFile(urlPath);
  if (!file) return send(res, 403, "Forbidden");

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Không tìm thấy trang");
    const ext = path.extname(file).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      ...SECURITY_HEADERS,
    };
    if (ext === ".html") headers["Content-Security-Policy"] = CSP;
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  });
}

async function handleApi(req, res, url) {
  if (!db.isReady()) {
    return sendJson(res, 503, { error: "Không kết nối được máy chủ. Vui lòng thử lại sau." });
  }
  const p = url.pathname;
  if (p === "/api/register" && req.method === "POST") return player.register(req, res);
  if (p === "/api/me" && req.method === "GET") return player.me(req, res);
  if (p === "/api/rounds" && req.method === "POST") return player.saveRound(req, res);
  if (p.startsWith("/api/admin/")) return admin.route(req, res, url);
  throw new HttpError(404, "Không tìm thấy.");
}

/* Lỗi kết nối database → 503 dễ hiểu; lỗi khác → 500, không lộ chi tiết kỹ thuật */
function isDbDown(err) {
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "57P01", "57P03", "08006", "08001"].includes(err.code) ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(err.message || "");
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return send(res, 400, "Bad Request");
  }
  // Ghi log đường dẫn, KHÔNG ghi chuỗi tìm kiếm (có thể chứa thông tin cá nhân)
  res.on("finish", () => log(req.method, url.pathname, res.statusCode, Date.now() - started + "ms"));

  let urlPath;
  try {
    urlPath = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }
  if (urlPath.includes("\0")) return send(res, 400, "Bad Request");

  if (urlPath === "/healthz") return send(res, 200, "ok");
  if (urlPath === "/favicon.ico") {
    res.writeHead(204, { "Cache-Control": "max-age=86400" });
    return res.end();
  }

  if (urlPath.startsWith("/api/")) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      await handleApi(req, res, url);
    } catch (err) {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) return sendJson(res, err.status, err.body);
      if (isDbDown(err)) {
        log("Lỗi database:", err.message);
        return sendJson(res, 503, { error: "Không kết nối được máy chủ. Vui lòng thử lại sau." });
      }
      log("Lỗi máy chủ:", err.stack || err.message);
      return sendJson(res, 500, { error: "Có lỗi xảy ra. Vui lòng thử lại." });
    }
    return;
  }

  return serveStatic(req, res, urlPath);
});

server.listen(PORT, HOST, () => {
  log(`Đập Chuột đang chạy tại http://localhost:${PORT}  ·  Trang admin: http://localhost:${PORT}/admin`);
});
db.init();

function shutdown(signal) {
  log(`Nhận ${signal}, đang dừng server...`);
  server.close(() => db.pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
