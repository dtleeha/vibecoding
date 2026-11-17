/* ==========================================================================
   Đập Chuột — đăng ký người chơi và gửi điểm (F13, F14, F15)
   docs/02-chuc-nang.html · F13–F15, docs/04-quy-tac-du-lieu.html · 4.7–4.10
   ========================================================================== */
(function () {
  "use strict";

  const V = window.DapChuotValidate;
  const KEY_DEVICE = "dapchuot.thietbi";  // { token, name }
  const KEY_QUEUE = "dapchuot.diemcho";   // [{ token, roundId, score, endedAt }]
  const QUEUE_MAX = 20;
  const MSG_OFFLINE = "Không kết nối được máy chủ. Vui lòng thử lại.";

  /* ---------- Lưu trên trình duyệt (bị chặn thì giữ trong phiên) ---------- */
  const memory = {};
  function load(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch (e) { /* bị chặn hoặc hỏng */ }
    return key in memory ? memory[key] : fallback;
  }
  function save(key, value) {
    memory[key] = value;
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* bị chặn: chỉ giữ trong phiên */ }
  }

  function getDevice() {
    const d = load(KEY_DEVICE, null);
    return d && typeof d.token === "string" && typeof d.name === "string" ? d : null;
  }
  function getQueue() {
    const q = load(KEY_QUEUE, []);
    return Array.isArray(q) ? q.filter((x) => x && typeof x.token === "string") : [];
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      try { return window.crypto.randomUUID(); } catch (e) { /* trang không an toàn */ }
    }
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
  }

  async function api(path, options) {
    const res = await fetch(path, Object.assign({ cache: "no-store" }, options));
    let data = {};
    try { data = await res.json(); } catch (e) { /* không phải JSON */ }
    return { status: res.status, data };
  }

  /* ---------- Giao diện ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $("registerForm"),
    name: $("regName"),
    email: $("regEmail"),
    phone: $("regPhone"),
    consent: $("regConsent"),
    btn: $("btnRegister"),
    formError: $("registerError"),
    greeting: $("greeting"),
    greetingName: $("greetingName"),
    notMe: $("btnNotMe"),
    pending: $("pendingNote"),
    notice: $("noticeModal"),
    btnNotice: $("btnNotice"),
    btnNoticeClose: $("btnNoticeClose"),
  };
  const fields = { name: el.name, email: el.email, phone: el.phone, consent: el.consent };
  const errorEls = { name: $("errName"), email: $("errEmail"), phone: $("errPhone"), consent: $("errConsent") };
  const checks = {
    name: () => V.checkName(el.name.value),
    email: () => V.checkEmail(el.email.value),
    phone: () => V.checkPhone(el.phone.value),
    consent: () => V.checkConsent(el.consent.checked),
  };

  let host = null;           // { showScreen } do game.js truyền vào
  let needRegister = false;  // server báo mã thiết bị không còn hợp lệ
  let sending = false;
  let flushing = false;

  function setFieldError(key, msg) {
    errorEls[key].textContent = msg || "";
    fields[key].closest(".field").classList.toggle("is-invalid", !!msg);
    fields[key].setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function showFormError(msg) {
    el.formError.textContent = msg || "";
    el.formError.hidden = !msg;
  }

  function shortName(name) {
    const chars = Array.from(name);
    return chars.length > 20 ? chars.slice(0, 20).join("") + "…" : name;
  }

  function renderStart() {
    const d = getDevice();
    el.greeting.hidden = !d;
    el.notMe.hidden = !d;
    if (d) el.greetingName.textContent = shortName(d.name);
    const n = getQueue().length;
    el.pending.hidden = n === 0;
    el.pending.textContent = n ? `Có ${n} lượt chưa lưu lên máy chủ, sẽ thử lại sau.` : "";
  }

  function showStart() {
    renderStart();
    host.showScreen("start");
  }

  function showRegister() {
    needRegister = false;
    showFormError("");
    host.showScreen("register");
    window.setTimeout(() => {
      if (!el.name.value) el.name.focus();
    }, 0);
  }

  function forgetDevice() {
    save(KEY_DEVICE, null);
  }

  /* ---------- F13 · Gửi form đăng ký ---------- */
  async function submit(e) {
    e.preventDefault();
    if (sending) return;
    showFormError("");

    let firstBad = null;
    Object.keys(checks).forEach((k) => {
      const r = checks[k]();
      setFieldError(k, r.error);
      if (r.error && !firstBad) firstBad = fields[k];
    });
    if (firstBad) { firstBad.focus(); return; }

    sending = true;
    el.btn.disabled = true;
    el.btn.textContent = "Đang gửi…";
    try {
      const { status, data } = await api("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: el.name.value,
          email: el.email.value,
          phone: el.phone.value,
          consent: el.consent.checked,
        }),
      });
      if ((status === 200 || status === 201) && data.token) {
        save(KEY_DEVICE, { token: data.token, name: data.name });
        el.form.reset();
        Object.keys(errorEls).forEach((k) => setFieldError(k, ""));
        showStart();
        flushQueue();
        return;
      }
      if (data && data.errors) {
        let focus = null;
        Object.keys(data.errors).forEach((k) => {
          if (errorEls[k]) {
            setFieldError(k, data.errors[k]);
            if (!focus) focus = fields[k];
          }
        });
        if (focus) focus.focus();
        else showFormError(MSG_OFFLINE);
      } else {
        showFormError(status >= 500 || status === 0 ? MSG_OFFLINE : (data.error || MSG_OFFLINE));
      }
    } catch (err) {
      showFormError(MSG_OFFLINE); // mất mạng, server tắt, mở trực tiếp file
    } finally {
      sending = false;
      el.btn.disabled = false;
      el.btn.textContent = "Vào chơi";
    }
  }

  /* ---------- F15 · Hàng chờ điểm ---------- */
  function enqueue(score) {
    const d = getDevice();
    if (!d) return;
    const q = getQueue();
    q.push({ token: d.token, roundId: randomId(), score, endedAt: new Date().toISOString() });
    while (q.length > QUEUE_MAX) q.shift(); // đầy thì bỏ lượt cũ nhất
    save(KEY_QUEUE, q);
  }

  async function flushQueue() {
    if (flushing) return;
    flushing = true;
    try {
      for (;;) {
        const q = getQueue();
        if (!q.length) break;
        const item = q[0];
        let result;
        try {
          result = await api("/api/rounds", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + item.token },
            body: JSON.stringify({ roundId: item.roundId, score: item.score, endedAt: item.endedAt }),
          });
        } catch (e) {
          break; // mất mạng → giữ nguyên hàng chờ, thử lại sau
        }
        if (result.status >= 500 || result.status === 0) break;
        const rest = getQueue().filter((x) => x.roundId !== item.roundId);
        if (result.status === 401) {
          // Người chơi đã bị xoá: bỏ các lượt của mã này; nếu là máy đang dùng thì phải đăng ký lại
          const d = getDevice();
          save(KEY_QUEUE, rest.filter((x) => x.token !== item.token));
          if (d && d.token === item.token) { forgetDevice(); needRegister = true; }
          continue;
        }
        // Thành công, hoặc bị từ chối hẳn (điểm/tần suất không hợp lệ) → bỏ khỏi hàng chờ
        save(KEY_QUEUE, rest);
      }
    } finally {
      flushing = false;
      if (host && document.getElementById("screenStart") && !document.getElementById("screenStart").hidden) renderStart();
    }
  }

  /* ---------- F14 · Kiểm tra mã thiết bị khi mở game ---------- */
  async function verifyDevice() {
    const d = getDevice();
    if (!d) return;
    try {
      const { status, data } = await api("/api/me", { headers: { Authorization: "Bearer " + d.token } });
      if (status === 401) {
        forgetDevice();
        save(KEY_QUEUE, getQueue().filter((x) => x.token !== d.token));
        showRegister();
      } else if (status === 200 && data.name && data.name !== d.name) {
        save(KEY_DEVICE, { token: d.token, name: data.name });
        renderStart();
      }
    } catch (e) {
      /* mất mạng: vẫn cho chơi, điểm vào hàng chờ */
    }
  }

  /* ---------- Hộp thông báo xử lý dữ liệu ---------- */
  let lastFocus = null;
  function openNotice() {
    lastFocus = document.activeElement;
    el.notice.hidden = false;
    el.btnNoticeClose.focus();
  }
  function closeNotice() {
    el.notice.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  /* ---------- Gắn sự kiện ---------- */
  el.form.addEventListener("submit", submit);
  Object.keys(checks).forEach((k) => {
    const evt = k === "consent" ? "change" : "blur";
    fields[k].addEventListener(evt, () => {
      if (k !== "consent" && !fields[k].value) return; // chưa nhập thì chưa báo lỗi khi rời ô
      setFieldError(k, checks[k]().error);
    });
    if (k !== "consent") {
      fields[k].addEventListener("input", () => {
        if (fields[k].closest(".field").classList.contains("is-invalid")) setFieldError(k, checks[k]().error);
      });
    }
  });
  el.notMe.addEventListener("click", () => {
    forgetDevice();
    showRegister();
  });
  el.btnNotice.addEventListener("click", openNotice);
  el.btnNoticeClose.addEventListener("click", closeNotice);
  el.notice.addEventListener("click", (e) => { if (e.target === el.notice) closeNotice(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.notice.hidden) closeNotice(); });

  window.DapChuotPlayer = {
    init(h) {
      host = h;
      if (getDevice()) {
        showStart();
        verifyDevice();
      } else {
        showRegister();
      }
      flushQueue();
    },
    canPlay() {
      return !needRegister && !!getDevice();
    },
    showRegister,
    roundEnded(score) {
      enqueue(score);
      window.setTimeout(flushQueue, 0);
    },
  };
})();
