"use strict";
/*
 * Đặt lại tài khoản admin theo ADMIN_EMAIL / ADMIN_PASSWORD trong file .env.
 * Dùng khi quên mật khẩu hoặc bị khoá. Chạy bên trong container:
 *   docker compose exec -T app node server/reset-admin.js
 * (hoặc bấm đúp DAT-LAI-MAT-KHAU-ADMIN.bat trên Windows)
 *
 * Kết quả: admin có email đó tồn tại, đang hoạt động, hết bị khoá, mật khẩu = ADMIN_PASSWORD,
 * phải đặt mật khẩu mới ở lần đăng nhập kế tiếp; mọi phiên đăng nhập cũ bị huỷ.
 */
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { checkEmail, normalizeName } = require("../app/validate.js");

async function main() {
  const email = checkEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD || "";
  const name = normalizeName(process.env.ADMIN_NAME) || "Quan tri vien";
  if (email.error) throw new Error("ADMIN_EMAIL trong .env khong hop le.");
  if (password.length < 10 || password.toLowerCase() === email.value) {
    throw new Error("ADMIN_PASSWORD trong .env phai tu 10 ky tu va khac email.");
  }

  const pool = new Pool({ max: 1, connectionTimeoutMillis: 10000 });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO admins (full_name, email, password_hash, must_change_password)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         must_change_password = true,
         is_active = true,
         failed_attempts = 0,
         locked_until = NULL
       RETURNING id, (xmax = 0) AS created`,
      [name, email.value, hash]
    );
    const admin = rows[0];
    await pool.query("DELETE FROM admin_sessions WHERE admin_id = $1", [admin.id]);
    await pool.query(
      "INSERT INTO audit_logs (admin_id, action, item_count, note) VALUES ($1, 'reset_admin_password', 1, 'dat lai tu dong lenh')",
      [admin.id]
    );
    console.log(`OK: ${admin.created ? "da tao" : "da dat lai"} admin ${email.value}.`);
    console.log("Dang nhap bang mat khau ADMIN_PASSWORD trong .env, roi dat mat khau moi.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("LOI: " + err.message);
  process.exit(1);
});
