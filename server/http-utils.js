"use strict";
/* Các hàm nhỏ dùng chung cho API: đọc JSON, trả JSON, lỗi có mã HTTP */

class HttpError extends Error {
  constructor(status, body) {
    super(typeof body === "string" ? body : JSON.stringify(body));
    this.status = status;
    this.body = typeof body === "string" ? { error: body } : body;
  }
}

const MAX_BODY = 16 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers["content-type"] || "");
    if (!type.toLowerCase().startsWith("application/json")) {
      reject(new HttpError(415, "Yêu cầu phải gửi dạng JSON."));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "Dữ liệu gửi lên quá lớn."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpError(400, "Dữ liệu gửi lên không hợp lệ."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

/* Chạy qua HTTPS (trực tiếp hoặc sau ngrok/proxy) thì cookie cần cờ Secure */
function isHttps(req) {
  if (req.socket && req.socket.encrypted) return true;
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { HttpError, readJson, sendJson, parseCookies, isHttps, UUID_RE };
