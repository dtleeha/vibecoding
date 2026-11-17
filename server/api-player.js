"use strict";
/*
 * API cho người chơi (không cần đăng nhập):
 *   POST /api/register   đăng ký / cập nhật người chơi, trả mã thiết bị   (F13, docs 04 · 4.7–4.8)
 *   GET  /api/me         kiểm tra mã thiết bị còn hợp lệ                  (F14)
 *   POST /api/rounds     lưu điểm một lượt                                 (F15, docs 04 · 4.10)
 */
const crypto = require("node:crypto");
const { pool, tx, log } = require("./db");
const { HttpError, readJson, sendJson } = require("./http-utils");
const V = require("../app/validate.js");

const SCORE_MIN = 0;
const SCORE_MAX = 150;
const MIN_GAP_SECONDS = 25;
const REGISTER_LOCK_KEY = 815001; // khoá chung: mỗi lúc chỉ xử lý 1 đăng ký → không tạo trùng khi gửi dồn dập

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function deviceToken(req) {
  const h = String(req.headers.authorization || "");
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(h);
  return m ? m[1] : null;
}

async function findDevice(req) {
  const token = deviceToken(req);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT d.id AS device_id, p.id AS player_id, p.full_name
       FROM player_devices d JOIN players p ON p.id = d.player_id
      WHERE d.token_hash = $1`,
    [sha256(token)]
  );
  return rows[0] || null;
}

const REGISTER_AGAIN = { code: "REGISTER_AGAIN", error: "Cần đăng ký lại." };

async function register(req, res) {
  const body = await readJson(req);
  const check = V.checkRegistration({
    name: body.name,
    email: body.email,
    phone: body.phone,
    consent: body.consent,
  });
  if (!check.ok) return sendJson(res, 400, { errors: check.errors });

  const { name, email, phone } = check.values;
  const search = V.searchKey(`${name} ${email} ${phone}`);
  const token = crypto.randomBytes(32).toString("base64url");

  const result = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock($1)", [REGISTER_LOCK_KEY]);
    const byEmail = (await c.query("SELECT id FROM players WHERE email = $1", [email])).rows[0];
    const byPhone = (await c.query("SELECT id FROM players WHERE phone = $1", [phone])).rows[0];

    // Email thuộc người A, SĐT thuộc người B khác → không gộp (docs 04 · 4.8)
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      return { conflict: true };
    }

    let playerId;
    let isNew = false;
    const target = byEmail || byPhone;
    if (target) {
      // Cùng một người: cập nhật thông tin, giữ ngày đăng ký và điểm cũ
      playerId = target.id;
      await c.query(
        `UPDATE players SET full_name = $2, email = $3, phone = $4, search_text = $5,
                consent_at = now(), consent_version = $6, updated_at = now()
          WHERE id = $1`,
        [playerId, name, email, phone, search, V.CONSENT_VERSION]
      );
    } else {
      isNew = true;
      playerId = (await c.query(
        `INSERT INTO players (full_name, email, phone, search_text, consent_at, consent_version)
         VALUES ($1, $2, $3, $4, now(), $5) RETURNING id`,
        [name, email, phone, search, V.CONSENT_VERSION]
      )).rows[0].id;
    }
    await c.query("INSERT INTO player_devices (player_id, token_hash) VALUES ($1, $2)", [playerId, sha256(token)]);
    return { playerId, isNew };
  });

  if (result.conflict) {
    return sendJson(res, 409, { errors: { phone: "Số điện thoại này đã được đăng ký với email khác." } });
  }
  log(`Đăng ký: ${result.isNew ? "người chơi mới" : "cập nhật người chơi cũ"}`);
  return sendJson(res, result.isNew ? 201 : 200, { token, name });
}

async function me(req, res) {
  const dev = await findDevice(req);
  if (!dev) return sendJson(res, 401, REGISTER_AGAIN);
  await pool.query("UPDATE player_devices SET last_seen_at = now() WHERE id = $1", [dev.device_id]);
  return sendJson(res, 200, { name: dev.full_name });
}

async function saveRound(req, res) {
  const body = await readJson(req);
  const dev = await findDevice(req);
  if (!dev) return sendJson(res, 401, REGISTER_AGAIN);

  const roundKey = typeof body.roundId === "string" ? body.roundId : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(roundKey)) throw new HttpError(400, "Mã lượt không hợp lệ.");

  const score = body.score;
  if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
    log(`CẢNH BÁO: từ chối điểm không hợp lệ (${JSON.stringify(score)}) từ thiết bị ${dev.device_id}`);
    throw new HttpError(400, "Điểm không hợp lệ.");
  }

  const endedAt = new Date(body.endedAt);
  const now = Date.now();
  if (Number.isNaN(endedAt.getTime()) || endedAt.getTime() > now + 5 * 60 * 1000 || endedAt.getTime() < now - 30 * 86400 * 1000) {
    throw new HttpError(400, "Thời điểm kết thúc không hợp lệ.");
  }

  // Gửi lại cùng một lượt → chỉ có 1 bản ghi, vẫn báo thành công
  const dup = await pool.query("SELECT 1 FROM rounds WHERE round_key = $1", [roundKey]);
  if (dup.rowCount) return sendJson(res, 200, { ok: true, duplicate: true });

  // Hai lượt của cùng một máy phải cách nhau ít nhất 25 giây
  const near = await pool.query(
    `SELECT 1 FROM rounds WHERE device_id = $1
        AND abs(extract(epoch FROM (ended_at - $2::timestamptz))) < $3 LIMIT 1`,
    [dev.device_id, endedAt.toISOString(), MIN_GAP_SECONDS]
  );
  if (near.rowCount) {
    log(`CẢNH BÁO: từ chối lượt gửi quá dày từ thiết bị ${dev.device_id}`);
    throw new HttpError(409, { code: "TOO_FREQUENT", error: "Lượt chơi gửi quá dày." });
  }

  await pool.query(
    `INSERT INTO rounds (player_id, device_id, round_key, score, ended_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (round_key) DO NOTHING`,
    [dev.player_id, dev.device_id, roundKey, score, endedAt.toISOString()]
  );
  await pool.query("UPDATE player_devices SET last_seen_at = now() WHERE id = $1", [dev.device_id]);
  return sendJson(res, 201, { ok: true });
}

module.exports = { register, me, saveRound };
