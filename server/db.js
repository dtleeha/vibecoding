"use strict";
/*
 * Kết nối PostgreSQL, tạo bảng (migration) và tạo admin đầu tiên.
 * Thông tin kết nối đọc từ biến môi trường PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
 * (docker-compose.yml lấy từ file .env).
 */
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { checkEmail } = require("../app/validate.js");

const pool = new Pool({ max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
pool.on("error", (err) => log("Lỗi kết nối database (pool):", err.message));

let ready = false;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

const MIGRATION = `
CREATE TABLE IF NOT EXISTS players (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  email            text NOT NULL UNIQUE,
  phone            text NOT NULL UNIQUE,
  search_text      text NOT NULL,
  consent_at       timestamptz NOT NULL,
  consent_version  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_devices_player_idx ON player_devices(player_id);

CREATE TABLE IF NOT EXISTS rounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  device_id    uuid REFERENCES player_devices(id) ON DELETE SET NULL,
  round_key    text NOT NULL UNIQUE,
  score        integer NOT NULL CHECK (score BETWEEN 0 AND 150),
  ended_at     timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rounds_player_idx ON rounds(player_id);
CREATE INDEX IF NOT EXISTS rounds_device_ended_idx ON rounds(device_id, ended_at);

CREATE TABLE IF NOT EXISTS admins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             text NOT NULL,
  email                 text NOT NULL UNIQUE,
  password_hash         text NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  failed_attempts       integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id_hash       text PRIMARY KEY,
  admin_id      uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf_token    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigserial PRIMARY KEY,
  admin_id    uuid REFERENCES admins(id) ON DELETE SET NULL,
  action      text NOT NULL,
  item_count  integer NOT NULL DEFAULT 0,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
`;

/* Tạo admin đầu tiên từ .env, CHỈ khi bảng admins đang trống (docs 04 · 4.11) */
async function seedFirstAdmin() {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM admins");
  if (rows[0].n > 0) return;
  const email = checkEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Quản trị viên").trim() || "Quản trị viên";
  if (email.error) {
    log("CẢNH BÁO: chưa có admin và ADMIN_EMAIL trong .env không hợp lệ — chưa tạo admin đầu tiên.");
    return;
  }
  if (password.length < 10 || password.toLowerCase() === email.value) {
    log("CẢNH BÁO: ADMIN_PASSWORD trong .env phải từ 10 ký tự và khác email — chưa tạo admin đầu tiên.");
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins (full_name, email, password_hash, must_change_password)
     VALUES ($1, $2, $3, true) ON CONFLICT (email) DO NOTHING`,
    [name, email.value, hash]
  );
  log(`Đã tạo admin đầu tiên: ${email.value} (phải đổi mật khẩu ở lần đăng nhập đầu).`);
}

/* Chờ database sẵn sàng, tạo bảng, tạo admin đầu tiên. Thử lại mỗi 3 giây. */
async function init() {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("SELECT 1");
      await pool.query(MIGRATION);
      await seedFirstAdmin();
      ready = true;
      log("Database sẵn sàng.");
      return;
    } catch (err) {
      if (attempt === 1 || attempt % 10 === 0) log(`Chưa kết nối được database (lần ${attempt}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/* Chạy fn(client) trong một giao dịch: lỗi giữa chừng thì không lưu gì */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* bỏ qua */ }
    throw err;
  } finally {
    client.release();
  }
}

async function audit(adminId, action, count = 0, note = null) {
  try {
    await pool.query("INSERT INTO audit_logs (admin_id, action, item_count, note) VALUES ($1, $2, $3, $4)", [adminId, action, count, note]);
  } catch (err) {
    log("Không ghi được nhật ký:", err.message);
  }
}

module.exports = {
  pool, tx, init, audit, log,
  isReady: () => ready,
};
