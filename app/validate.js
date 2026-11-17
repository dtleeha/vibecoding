/* ==========================================================================
   Quy tắc kiểm tra form đăng ký — dùng CHUNG cho trình duyệt và server
   (docs/04-quy-tac-du-lieu.html · 4.7). Sửa quy tắc chỉ cần sửa ở đây.
   ========================================================================== */
(function (root) {
  "use strict";

  const CONSENT_VERSION = "v1";

  const MSG = {
    nameEmpty: "Vui lòng nhập họ tên.",
    nameInvalid: "Họ tên từ 2 đến 60 ký tự, chỉ gồm chữ cái.",
    emailEmpty: "Vui lòng nhập email.",
    emailInvalid: "Email chưa đúng định dạng.",
    phoneEmpty: "Vui lòng nhập số điện thoại.",
    phoneInvalid: "Số điện thoại chưa đúng (VD: 0912 345 678).",
    consent: "Bạn cần đồng ý để tiếp tục.",
  };

  const NAME_RE = /^[\p{L}\p{M}'’ -]+$/u;
  const HAS_LETTER_RE = /\p{L}/u;
  // Dạng email thường gặp; bắt buộc tên miền có dấu chấm, không khoảng trắng
  const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  const PHONE_RE = /^0[35789]\d{8}$/;

  function normalizeName(v) {
    return String(v == null ? "" : v).normalize("NFC").trim().replace(/\s+/g, " ");
  }

  function checkName(v) {
    const n = normalizeName(v);
    if (!n) return { error: MSG.nameEmpty };
    const len = Array.from(n).length;
    if (len < 2 || len > 60 || !NAME_RE.test(n) || !HAS_LETTER_RE.test(n)) return { error: MSG.nameInvalid };
    return { value: n };
  }

  function checkEmail(v) {
    const e = String(v == null ? "" : v).trim().toLowerCase();
    if (!e) return { error: MSG.emailEmpty };
    if (e.length > 254 || !EMAIL_RE.test(e)) return { error: MSG.emailInvalid };
    return { value: e };
  }

  /* "0912 345 678", "0912.345.678", "+84 912 345 678", "84912345678" → "0912345678" */
  function normalizePhone(v) {
    let d = String(v == null ? "" : v).trim().replace(/[\s.\-()]/g, "");
    if (d.startsWith("+84")) d = "0" + d.slice(3);
    else if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2);
    return d;
  }

  function checkPhone(v) {
    if (!String(v == null ? "" : v).trim()) return { error: MSG.phoneEmpty };
    const d = normalizePhone(v);
    if (!PHONE_RE.test(d)) return { error: MSG.phoneInvalid };
    return { value: d };
  }

  function checkConsent(v) {
    return v === true ? { value: true } : { error: MSG.consent };
  }

  /* Kiểm tra cả form. Trả { ok, values, errors } */
  function checkRegistration(input) {
    const src = input || {};
    const r = {
      name: checkName(src.name),
      email: checkEmail(src.email),
      phone: checkPhone(src.phone),
      consent: checkConsent(src.consent),
    };
    const errors = {};
    const values = {};
    Object.keys(r).forEach((k) => {
      if (r[k].error) errors[k] = r[k].error;
      else values[k] = r[k].value;
    });
    return { ok: Object.keys(errors).length === 0, values, errors };
  }

  /* Chuỗi để tìm kiếm: bỏ dấu tiếng Việt, chữ thường ("Nguyễn" → "nguyen") */
  function searchKey(v) {
    return String(v == null ? "" : v)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  const api = {
    CONSENT_VERSION, MSG,
    normalizeName, normalizePhone,
    checkName, checkEmail, checkPhone, checkConsent, checkRegistration,
    searchKey,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DapChuotValidate = api;
})(typeof self !== "undefined" ? self : this);
