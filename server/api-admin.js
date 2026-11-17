"use strict";
/*
 * API trang admin (F16–F21, docs 04 · 4.11–4.13). Mọi địa chỉ trừ /login cần đăng nhập.
 *   POST /api/admin/login            GET  /api/admin/me             POST /api/admin/logout
 *   POST /api/admin/password
 *   GET  /api/admin/players          GET  /api/admin/players/:id    POST /api/admin/players/delete
 *   GET  /api/admin/players.csv
 *   GET  /api/admin/admins           POST /api/admin/admins
 *   POST /api/admin/admins/:id/lock | /unlock | /delete
 */
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { pool, tx, audit, log } = require("./db");
const { HttpError, readJson, sendJson, parseCookies, isHttps, UUID_RE } = require("./http-utils");
const V = require("../app/validate.js");

const COOKIE = "dc_admin";
const IDLE_MINUTES = 30;
const MAX_HOURS = 8;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const PAGE_SIZE = 20;
const BCRYPT_ROUNDS = 12;
const LOGIN_FAIL = "Email hoặc mật khẩu không đúng.";
const LOGIN_LOCKED = "Đăng nhập tạm khoá do nhập sai nhiều lần. Thử lại sau 15 phút.";
// Mật khẩu giả để so sánh khi email không tồn tại → thời gian trả lời giống nhau
const DUMMY_HASH = bcrypt.hashSync("khong-phai-mat-khau-that", BCRYPT_ROUNDS);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ---------------- Phiên đăng nhập ---------------- */

function setCookie(req, res, token, maxAge) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

async function createSession(req, res, adminId, client = pool) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(24).toString("base64url");
  await client.query(
    `INSERT INTO admin_sessions (id_hash, admin_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [sha256(token), adminId, csrf, MAX_HOURS]
  );
  setCookie(req, res, token, MAX_HOURS * 3600);
  return csrf;
}

/* Trả { admin, session } nếu phiên còn hạn, ngược lại null */
async function currentSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { rows } = await pool.query(
    `UPDATE admin_sessions s SET last_seen_at = now()
       FROM admins a
      WHERE s.id_hash = $1 AND a.id = s.admin_id AND a.is_active
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2)
      RETURNING s.id_hash, s.csrf_token, a.id, a.full_name, a.email, a.must_change_password`,
    [sha256(token), IDLE_MINUTES]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    session: { idHash: r.id_hash, csrf: r.csrf_token },
    admin: { id: r.id, name: r.full_name, email: r.email, mustChange: r.must_change_password },
  };
}

async function requireAdmin(req, { allowMustChange = false } = {}) {
  const s = await currentSession(req);
  if (!s) throw new HttpError(401, { code: "LOGIN_REQUIRED", error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
  if (req.method !== "GET" && req.headers["x-csrf-token"] !== s.session.csrf) {
    throw new HttpError(403, { code: "CSRF", error: "Yêu cầu không hợp lệ. Vui lòng tải lại trang." });
  }
  if (s.admin.mustChange && !allowMustChange) {
    throw new HttpError(403, { code: "MUST_CHANGE_PASSWORD", error: "Vui lòng đặt mật khẩu mới trước." });
  }
  return s;
}

function checkPassword(password, email) {
  if (typeof password !== "string" || password.length < 10) return "Mật khẩu phải có ít nhất 10 ký tự.";
  if (password.length > 200) return "Mật khẩu quá dài.";
  if (email && password.toLowerCase() === String(email).toLowerCase()) return "Mật khẩu không được trùng email.";
  return null;
}

/* ---------------- Đăng nhập / đăng xuất / đổi mật khẩu ---------------- */

async function login(req, res) {
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const { rows } = await pool.query(
    "SELECT id, password_hash, is_active, locked_until, failed_attempts FROM admins WHERE email = $1",
    [email]
  );
  const a = rows[0];
  if (!a) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new HttpError(401, LOGIN_FAIL);
  }
  if (a.locked_until && new Date(a.locked_until) > new Date()) {
    throw new HttpError(429, LOGIN_LOCKED);
  }
  const ok = await bcrypt.compare(password, a.password_hash);
  if (!ok || !a.is_active) {
    if (!ok) {
      const fails = a.failed_attempts + 1;
      if (fails >= MAX_FAILS) {
        await pool.query(
          "UPDATE admins SET failed_attempts = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1",
          [a.id, LOCK_MINUTES]
        );
        await audit(a.id, "login_locked");
        throw new HttpError(429, LOGIN_LOCKED);
      }
      await pool.query("UPDATE admins SET failed_attempts = $2 WHERE id = $1", [a.id, fails]);
    }
    throw new HttpError(401, LOGIN_FAIL);
  }
  await pool.query("UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [a.id]);
  await createSession(req, res, a.id);
  await audit(a.id, "login");
  return sendJson(res, 200, { ok: true });
}

async function me(req, res) {
  const s = await currentSession(req);
  if (!s) return sendJson(res, 200, { admin: null }); // chưa đăng nhập: không coi là lỗi
  return sendJson(res, 200, { admin: s.admin, csrf: s.session.csrf });
}

async function logout(req, res) {
  const s = await currentSession(req);
  if (s) {
    if (req.headers["x-csrf-token"] !== s.session.csrf) throw new HttpError(403, { code: "CSRF", error: "Yêu cầu không hợp lệ." });
    await pool.query("DELETE FROM admin_sessions WHERE admin_id = $1", [s.admin.id]);
    await audit(s.admin.id, "logout");
  }
  setCookie(req, res, "", 0);
  return sendJson(res, 200, { ok: true });
}

async function changePassword(req, res) {
  const s = await requireAdmin(req, { allowMustChange: true });
  const body = await readJson(req);
  const { rows } = await pool.query("SELECT password_hash FROM admins WHERE id = $1", [s.admin.id]);
  if (!rows[0] || !(await bcrypt.compare(String(body.current || ""), rows[0].password_hash))) {
    throw new HttpError(400, { errors: { current: "Mật khẩu hiện tại không đúng." } });
  }
  const problem = checkPassword(body.next, s.admin.email);
  if (problem) throw new HttpError(400, { errors: { next: problem } });
  if (await bcrypt.compare(body.next, rows[0].password_hash)) {
    throw new HttpError(400, { errors: { next: "Mật khẩu mới phải khác mật khẩu hiện tại." } });
  }
  const hash = await bcrypt.hash(body.next, BCRYPT_ROUNDS);
  const csrf = await tx(async (c) => {
    await c.query("UPDATE admins SET password_hash = $2, must_change_password = false WHERE id = $1", [s.admin.id, hash]);
    // Huỷ mọi phiên (kể cả ở máy khác), cấp phiên mới cho máy đang dùng
    await c.query("DELETE FROM admin_sessions WHERE admin_id = $1", [s.admin.id]);
    return createSession(req, res, s.admin.id, c);
  });
  await audit(s.admin.id, "change_password");
  return sendJson(res, 200, { ok: true, csrf });
}

/* ---------------- Người chơi ---------------- */

const SORTS = {
  name: "p.full_name",
  email: "p.email",
  phone: "p.phone",
  created: "p.created_at",
  rounds: "rounds_count",
  best: "best_score",
  last: "last_played",
};

const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => "\\" + m);

/* Dựng điều kiện tìm kiếm (docs F18): không phân biệt dấu/hoa thường, SĐT viết kiểu nào cũng được */
function searchFilter(q) {
  const raw = String(q || "").trim().slice(0, 100);
  if (!raw) return { where: "TRUE", params: [] };
  const text = V.searchKey(raw);
  const params = ["%" + escapeLike(text) + "%"];
  let where = "p.search_text LIKE $1 ESCAPE '\\'";
  if (/\d/.test(raw) && /^[\d\s.+\-()]+$/.test(raw)) {
    let digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+84") || (raw.startsWith("84") && digits.length >= 3)) digits = "0" + digits.slice(2);
    params.push("%" + digits + "%");
    where = `(${where} OR p.phone LIKE $2)`;
  }
  return { where, params };
}

function listQuery(q, sort, dir, { paged }) {
  const col = SORTS[sort] || SORTS.created;
  const direction = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const f = searchFilter(q);
  const sql = `
    SELECT p.id, p.full_name, p.email, p.phone, p.created_at, p.consent_at,
           COALESCE(s.rounds_count, 0)::int AS rounds_count,
           s.best_score, s.last_played,
           count(*) OVER ()::int AS total
      FROM players p
      LEFT JOIN (SELECT player_id, count(*) AS rounds_count, max(score) AS best_score, max(ended_at) AS last_played
                   FROM rounds GROUP BY player_id) s ON s.player_id = p.id
     WHERE ${f.where}
     ORDER BY ${col} ${direction} NULLS LAST, p.created_at DESC, p.id
     ${paged ? `LIMIT ${PAGE_SIZE} OFFSET $${f.params.length + 1}` : ""}`;
  return { sql, params: f.params };
}

async function listPlayers(req, res, url) {
  await requireAdmin(req);
  const p = url.searchParams;
  const page = Math.max(1, Math.min(100000, parseInt(p.get("page"), 10) || 1));
  const { sql, params } = listQuery(p.get("q"), p.get("sort"), p.get("dir"), { paged: true });
  const { rows } = await pool.query(sql, [...params, (page - 1) * PAGE_SIZE]);
  let total = rows[0] ? rows[0].total : 0;
  if (!rows[0] && page > 1) {
    const cnt = listQuery(p.get("q"), p.get("sort"), p.get("dir"), { paged: false });
    total = (await pool.query(`SELECT count(*)::int AS n FROM (${cnt.sql}) x`, cnt.params)).rows[0].n;
  }
  return sendJson(res, 200, {
    total, page, pageSize: PAGE_SIZE,
    players: rows.map((r) => ({
      id: r.id, name: r.full_name, email: r.email, phone: r.phone,
      createdAt: r.created_at, consentAt: r.consent_at,
      rounds: r.rounds_count, best: r.best_score, lastPlayed: r.last_played,
    })),
  });
}

async function playerDetail(req, res, id) {
  await requireAdmin(req);
  if (!UUID_RE.test(id)) throw new HttpError(404, "Người chơi không còn tồn tại.");
  const p = (await pool.query(
    "SELECT id, full_name, email, phone, created_at, updated_at, consent_at, consent_version FROM players WHERE id = $1",
    [id]
  )).rows[0];
  if (!p) throw new HttpError(404, "Người chơi không còn tồn tại.");
  const rounds = (await pool.query(
    "SELECT score, ended_at FROM rounds WHERE player_id = $1 ORDER BY ended_at DESC LIMIT 200",
    [id]
  )).rows;
  return sendJson(res, 200, {
    player: {
      id: p.id, name: p.full_name, email: p.email, phone: p.phone,
      createdAt: p.created_at, updatedAt: p.updated_at, consentAt: p.consent_at, consentVersion: p.consent_version,
    },
    rounds: rounds.map((r) => ({ score: r.score, endedAt: r.ended_at })),
  });
}

async function deletePlayers(req, res) {
  const s = await requireAdmin(req);
  const body = await readJson(req);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length || ids.length > 500 || !ids.every((x) => typeof x === "string" && UUID_RE.test(x))) {
    throw new HttpError(400, "Danh sách người chơi cần xoá không hợp lệ.");
  }
  // Xoá người chơi; lượt chơi và mã thiết bị bị xoá theo (ON DELETE CASCADE) trong cùng giao dịch
  const deleted = await tx(async (c) => (await c.query("DELETE FROM players WHERE id = ANY($1::uuid[]) RETURNING id", [ids])).rowCount);
  if (deleted === 0) throw new HttpError(404, "Người chơi không còn tồn tại.");
  // Nhật ký chỉ ghi số lượng, không ghi thông tin cá nhân
  await audit(s.admin.id, "delete_players", deleted);
  return sendJson(res, 200, { deleted, missing: ids.length - deleted });
}

/* ---------------- Xuất CSV (docs 04 · 4.12) ---------------- */

const vnTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
function fmtVN(d) {
  if (!d) return "";
  const parts = Object.fromEntries(vnTime.formatToParts(new Date(d)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}
function stampVN(d) {
  const parts = Object.fromEntries(vnTime.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour === "24" ? "00" : parts.hour}${parts.minute}`;
}

function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s; // chống chèn công thức Excel
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function exportCsv(req, res, url) {
  const s = await requireAdmin(req);
  const p = url.searchParams;
  const { sql, params } = listQuery(p.get("q"), p.get("sort"), p.get("dir"), { paged: false });
  const { rows } = await pool.query(sql, params);
  const header = ["STT", "Họ tên", "Email", "Số điện thoại", "Ngày đăng ký", "Số lượt chơi", "Điểm cao nhất", "Lần chơi gần nhất", "Ngày đồng ý xử lý dữ liệu"];
  const lines = [header.map(csvCell).join(",")];
  rows.forEach((r, i) => {
    lines.push([
      i + 1, r.full_name, r.email, r.phone, fmtVN(r.created_at), r.rounds_count,
      r.best_score == null ? "" : r.best_score, fmtVN(r.last_played), fmtVN(r.consent_at),
    ].map(csvCell).join(","));
  });
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  await audit(s.admin.id, "export_csv", rows.length);
  const filename = `dapchuot-nguoi-choi-${stampVN(new Date())}.csv`;
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/* ---------------- Tài khoản admin (F21) ---------------- */

async function listAdmins(req, res) {
  const s = await requireAdmin(req);
  const { rows } = await pool.query(
    "SELECT id, full_name, email, is_active, last_login_at, created_at FROM admins ORDER BY created_at"
  );
  return sendJson(res, 200, {
    me: s.admin.id,
    admins: rows.map((r) => ({
      id: r.id, name: r.full_name, email: r.email, active: r.is_active,
      lastLoginAt: r.last_login_at, createdAt: r.created_at,
    })),
  });
}

async function createAdmin(req, res) {
  const s = await requireAdmin(req);
  const body = await readJson(req);
  const errors = {};
  const name = V.normalizeName(body.name);
  if (Array.from(name).length < 2 || Array.from(name).length > 60) errors.name = "Họ tên từ 2 đến 60 ký tự.";
  const email = V.checkEmail(body.email);
  if (email.error) errors.email = email.error;
  const pw = checkPassword(body.password, email.value);
  if (pw) errors.password = pw;
  if (Object.keys(errors).length) throw new HttpError(400, { errors });
  const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const r = await pool.query(
    `INSERT INTO admins (full_name, email, password_hash, must_change_password, created_by)
     VALUES ($1, $2, $3, true, $4) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [name, email.value, hash, s.admin.id]
  );
  if (!r.rowCount) throw new HttpError(409, { errors: { email: "Email này đã là admin." } });
  await audit(s.admin.id, "create_admin", 1);
  return sendJson(res, 201, { ok: true });
}

async function changeAdmin(req, res, id, action) {
  const s = await requireAdmin(req);
  if (!UUID_RE.test(id)) throw new HttpError(404, "Admin không còn tồn tại.");
  if (id === s.admin.id) throw new HttpError(400, "Không thể tự khoá hoặc tự xoá tài khoản của chính mình.");
  await tx(async (c) => {
    // Khoá cả bảng admin trong giao dịch để 2 thao tác đồng thời không làm mất admin cuối cùng
    await c.query("LOCK TABLE admins IN SHARE ROW EXCLUSIVE MODE");
    const target = (await c.query("SELECT id, is_active FROM admins WHERE id = $1", [id])).rows[0];
    if (!target) throw new HttpError(404, "Admin không còn tồn tại.");
    if (action !== "unlock" && target.is_active) {
      const active = (await c.query("SELECT count(*)::int AS n FROM admins WHERE is_active")).rows[0].n;
      if (active <= 1) throw new HttpError(400, "Không thể khoá hoặc xoá admin cuối cùng đang hoạt động.");
    }
    if (action === "lock") {
      await c.query("UPDATE admins SET is_active = false WHERE id = $1", [id]);
      await c.query("DELETE FROM admin_sessions WHERE admin_id = $1", [id]);
    } else if (action === "unlock") {
      await c.query("UPDATE admins SET is_active = true, failed_attempts = 0, locked_until = NULL WHERE id = $1", [id]);
    } else if (action === "delete") {
      await c.query("DELETE FROM admins WHERE id = $1", [id]);
    }
  });
  await audit(s.admin.id, `${action}_admin`, 1);
  return sendJson(res, 200, { ok: true });
}

/* ---------------- Bộ định tuyến ---------------- */

async function route(req, res, url) {
  const path = url.pathname.replace(/^\/api\/admin/, "");
  const m = req.method;
  if (m === "POST" && path === "/login") return login(req, res);
  if (m === "GET" && path === "/me") return me(req, res);
  if (m === "POST" && path === "/logout") return logout(req, res);
  if (m === "POST" && path === "/password") return changePassword(req, res);
  if (m === "GET" && path === "/players") return listPlayers(req, res, url);
  if (m === "GET" && path === "/players.csv") return exportCsv(req, res, url);
  if (m === "POST" && path === "/players/delete") return deletePlayers(req, res);
  let x = /^\/players\/([^/]+)$/.exec(path);
  if (m === "GET" && x) return playerDetail(req, res, x[1]);
  if (m === "GET" && path === "/admins") return listAdmins(req, res);
  if (m === "POST" && path === "/admins") return createAdmin(req, res);
  x = /^\/admins\/([^/]+)\/(lock|unlock|delete)$/.exec(path);
  if (m === "POST" && x) return changeAdmin(req, res, x[1], x[2]);
  throw new HttpError(404, "Không tìm thấy.");
}

module.exports = { route, log };
