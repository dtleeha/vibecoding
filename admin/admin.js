/* ==========================================================================
   Trang admin Đập Chuột (F16–F21). Mọi dữ liệu hiển thị bằng textContent
   (không chèn HTML từ dữ liệu) để tên lạ như <script> chỉ hiện dạng chữ.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const V = window.DapChuotValidate;

  const state = {
    me: null,
    csrf: "",
    list: { q: "", sort: "created", dir: "desc", page: 1 },
    selected: new Set(),
    pageIds: [],
    detailId: null,
  };

  /* ---------------- Tiện ích ---------------- */
  const fmt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  function fmtDate(d) {
    if (!d) return "—";
    const p = Object.fromEntries(fmt.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  }

  function td(text, cls) {
    const c = document.createElement("td");
    c.textContent = text == null ? "" : String(text);
    if (cls) c.className = cls;
    return c;
  }

  let toastTimer = 0;
  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("toast--error", !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  class ApiError extends Error {
    constructor(status, data) {
      super((data && data.error) || "Có lỗi xảy ra. Vui lòng thử lại.");
      this.status = status;
      this.data = data || {};
    }
  }

  async function api(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = state.csrf;
    let res;
    try {
      res = await fetch(path, {
        method, headers, credentials: "same-origin", cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError(0, { error: "Không kết nối được máy chủ. Vui lòng thử lại." });
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* không có nội dung */ }
    if (res.ok) return data;
    if (res.status === 401 && data.code === "LOGIN_REQUIRED") {
      showLogin(data.error);
      throw new ApiError(401, data);
    }
    if (res.status === 403 && data.code === "MUST_CHANGE_PASSWORD") {
      showPassword(true);
      throw new ApiError(403, data);
    }
    if (res.status === 403 && data.code === "CSRF") {
      await loadMe();
    }
    throw new ApiError(res.status, data);
  }

  /* ---------------- Màn hình ---------------- */
  const views = ["viewLogin", "viewPassword", "viewPlayers", "viewAdmins"];
  function showView(id) {
    views.forEach((v) => { $(v).hidden = v !== id; });
    const loggedIn = id !== "viewLogin" && state.me && !(id === "viewPassword" && state.me.mustChange);
    $("topbar").hidden = !loggedIn;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("is-active", (a.dataset.nav === "nguoi-choi" && id === "viewPlayers") || (a.dataset.nav === "tai-khoan" && id === "viewAdmins"));
    });
    window.scrollTo(0, 0);
  }

  function showLogin(message) {
    state.me = null;
    state.csrf = "";
    closeAllModals();
    $("loginError").hidden = !message;
    $("loginError").textContent = message || "";
    showView("viewLogin");
    $("loginEmail").focus();
  }

  function showPassword(forced) {
    $("passwordTitle").textContent = forced ? "Đặt mật khẩu mới" : "Đổi mật khẩu";
    $("passwordNote").hidden = !forced;
    $("btnCancelPw").hidden = !!forced;
    $("passwordForm").reset();
    $("pwUsername").value = state.me ? state.me.email : "";
    ["errCurrent", "errNext", "errAgain"].forEach((e) => { $(e).textContent = ""; });
    if (forced && state.me) state.me.mustChange = true;
    showView("viewPassword");
    $("pwCurrent").focus();
  }

  async function loadMe() {
    const res = await fetch("/api/admin/me", { credentials: "same-origin", cache: "no-store" });
    if (res.status !== 200) return false;
    const data = await res.json();
    if (!data.admin) return false;
    state.me = data.admin;
    state.csrf = data.csrf;
    $("meName").textContent = data.admin.name;
    return true;
  }

  /* Định tuyến theo #: #nguoi-choi (mặc định), #tai-khoan */
  function route() {
    if (!state.me) return;
    if (state.me.mustChange) return showPassword(true);
    if (location.hash === "#tai-khoan") {
      showView("viewAdmins");
      loadAdmins();
    } else {
      showView("viewPlayers");
      loadPlayers();
    }
  }

  async function boot() {
    try {
      if (await loadMe()) route();
      else showLogin();
    } catch (e) {
      showLogin("Không kết nối được máy chủ. Vui lòng thử lại.");
    }
  }

  /* ---------------- Đăng nhập / đăng xuất / mật khẩu ---------------- */
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btnLogin");
    $("loginError").hidden = true;
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    if (!email || !password) {
      $("loginError").textContent = "Vui lòng nhập email và mật khẩu.";
      $("loginError").hidden = false;
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        $("loginError").textContent = data.error || "Không kết nối được máy chủ. Vui lòng thử lại.";
        $("loginError").hidden = false;
        $("loginPassword").value = "";
        $("loginPassword").focus();
        return;
      }
      $("loginForm").reset();
      await boot(); // giữ nguyên # → quay về đúng trang đang làm dở
    } catch (err) {
      $("loginError").textContent = "Không kết nối được máy chủ. Vui lòng thử lại.";
      $("loginError").hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("btnShowPw").addEventListener("click", () => {
    const input = $("loginPassword");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    $("btnShowPw").textContent = show ? "Ẩn" : "Hiện";
    $("btnShowPw").setAttribute("aria-pressed", String(show));
  });

  $("btnLogout").addEventListener("click", async () => {
    try { await api("POST", "/api/admin/logout"); } catch (e) { /* vẫn về trang đăng nhập */ }
    location.hash = "";
    showLogin();
  });

  $("btnMyPassword").addEventListener("click", () => showPassword(false));
  $("btnCancelPw").addEventListener("click", route);

  $("passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = $("pwCurrent").value;
    const next = $("pwNext").value;
    const again = $("pwAgain").value;
    ["errCurrent", "errNext", "errAgain"].forEach((x) => { $(x).textContent = ""; });
    if (!current) { $("errCurrent").textContent = "Vui lòng nhập mật khẩu hiện tại."; return; }
    if (next.length < 10) { $("errNext").textContent = "Mật khẩu phải có ít nhất 10 ký tự."; return; }
    if (next !== again) { $("errAgain").textContent = "Hai lần nhập mật khẩu mới không khớp."; return; }
    $("btnSavePw").disabled = true;
    try {
      const data = await api("POST", "/api/admin/password", { current, next });
      state.csrf = data.csrf;
      state.me.mustChange = false;
      toast("Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.");
      route();
    } catch (err) {
      const errs = err.data && err.data.errors;
      if (errs) {
        if (errs.current) $("errCurrent").textContent = errs.current;
        if (errs.next) $("errNext").textContent = errs.next;
      } else if (err.status !== 401) {
        toast(err.message, true);
      }
    } finally {
      $("btnSavePw").disabled = false;
    }
  });

  /* ---------------- Hộp xác nhận (03 · 4.9) ---------------- */
  let confirmResolve = null;
  function confirmBox(title, text, okLabel) {
    $("confirmTitle").textContent = title;
    $("confirmText").textContent = text;
    $("btnConfirmOk").textContent = okLabel || "Xoá";
    $("confirmModal").hidden = false;
    $("btnConfirmCancel").focus(); // mặc định chọn Huỷ
    return new Promise((resolve) => { confirmResolve = resolve; });
  }
  function closeConfirm(result) {
    $("confirmModal").hidden = true;
    if (confirmResolve) { const r = confirmResolve; confirmResolve = null; r(result); }
  }
  $("btnConfirmCancel").addEventListener("click", () => closeConfirm(false));
  $("btnConfirmOk").addEventListener("click", () => closeConfirm(true));
  $("confirmModal").addEventListener("click", (e) => { if (e.target === $("confirmModal")) closeConfirm(false); });

  function closeDetail() { $("detailModal").hidden = true; state.detailId = null; }
  $("detailModal").addEventListener("click", (e) => {
    if (e.target === $("detailModal") || e.target.hasAttribute("data-close")) closeDetail();
  });
  function closeAllModals() { closeConfirm(false); closeDetail(); }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("confirmModal").hidden) closeConfirm(false);
    else if (!$("detailModal").hidden) closeDetail();
  });

  /* ---------------- Người chơi (F17–F20) ---------------- */
  function listParams(includePage) {
    const p = new URLSearchParams();
    if (state.list.q) p.set("q", state.list.q);
    p.set("sort", state.list.sort);
    p.set("dir", state.list.dir);
    if (includePage) p.set("page", String(state.list.page));
    return p.toString();
  }

  let loadSeq = 0;
  async function loadPlayers() {
    const seq = ++loadSeq;
    let data;
    try {
      data = await api("GET", "/api/admin/players?" + listParams(true));
    } catch (err) {
      if (err.status !== 401 && err.status !== 403) toast(err.message, true);
      return;
    }
    if (seq !== loadSeq) return; // đã có lần tải mới hơn
    renderPlayers(data);
  }

  function renderPlayers(data) {
    const body = $("playersBody");
    body.textContent = "";
    state.selected.clear();
    state.pageIds = data.players.map((p) => p.id);
    data.players.forEach((p) => {
      const tr = document.createElement("tr");
      const tdc = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.id = p.id;
      cb.setAttribute("aria-label", "Chọn " + p.name);
      tdc.appendChild(cb);
      tr.appendChild(tdc);
      const tdName = document.createElement("td");
      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "link";
      nameBtn.dataset.detail = p.id;
      nameBtn.textContent = p.name;
      tdName.appendChild(nameBtn);
      tr.appendChild(tdName);
      tr.appendChild(td(p.email));
      tr.appendChild(td(p.phone));
      tr.appendChild(td(fmtDate(p.createdAt)));
      tr.appendChild(td(p.rounds, "num"));
      tr.appendChild(td(p.best == null ? "—" : p.best, "num"));
      tr.appendChild(td(fmtDate(p.lastPlayed)));
      const tdAct = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--danger btn--sm";
      del.dataset.delete = p.id;
      del.dataset.name = p.name;
      del.dataset.email = p.email;
      del.textContent = "Xoá";
      tdAct.appendChild(del);
      tr.appendChild(tdAct);
      body.appendChild(tr);
    });

    const empty = $("playersEmpty");
    empty.hidden = data.players.length > 0;
    empty.textContent = state.list.q ? "Không tìm thấy người chơi nào." : "Chưa có người chơi nào đăng ký.";
    $("playersSummary").textContent = state.list.q
      ? `Tìm thấy ${data.total} người chơi`
      : `Tổng ${data.total} người chơi`;
    $("btnClearSearch").hidden = !state.list.q;
    $("checkAll").checked = false;
    updateSelection();
    renderSortHeaders();
    renderPager(data.total, data.pageSize);
  }

  function renderSortHeaders() {
    document.querySelectorAll(".sort").forEach((b) => {
      if (b.dataset.sort === state.list.sort) b.dataset.dir = state.list.dir;
      else delete b.dataset.dir;
    });
  }

  function renderPager(total, size) {
    const pager = $("pager");
    pager.textContent = "";
    const pages = Math.max(1, Math.ceil(total / size));
    if (pages <= 1) return;
    const cur = Math.min(state.list.page, pages);
    const add = (label, page, opts = {}) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--secondary btn--sm" + (opts.current ? " is-current" : "");
      if (opts.current) { b.className = "btn btn--sm is-current"; b.setAttribute("aria-current", "page"); }
      b.textContent = label;
      b.disabled = !!opts.disabled;
      if (opts.aria) b.setAttribute("aria-label", opts.aria);
      b.dataset.page = String(page);
      pager.appendChild(b);
    };
    const gap = () => { const s = document.createElement("span"); s.className = "gap"; s.textContent = "…"; pager.appendChild(s); };
    add("‹", cur - 1, { disabled: cur === 1, aria: "Trang trước" });
    const nums = new Set([1, pages, cur - 2, cur - 1, cur, cur + 1, cur + 2].filter((n) => n >= 1 && n <= pages));
    let prev = 0;
    [...nums].sort((a, b) => a - b).forEach((n) => {
      if (n - prev > 1) gap();
      add(String(n), n, { current: n === cur });
      prev = n;
    });
    add("›", cur + 1, { disabled: cur === pages, aria: "Trang sau" });
  }

  function updateSelection() {
    const n = state.selected.size;
    $("btnDeleteSelected").disabled = n === 0;
    $("btnDeleteSelected").textContent = n ? `Xoá đã chọn (${n})` : "Xoá đã chọn";
    $("checkAll").checked = n > 0 && n === state.pageIds.length;
  }

  $("pager").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b || b.disabled) return;
    state.list.page = parseInt(b.dataset.page, 10);
    loadPlayers();
  });

  document.querySelectorAll(".sort").forEach((b) => {
    b.addEventListener("click", () => {
      const col = b.dataset.sort;
      if (state.list.sort === col) state.list.dir = state.list.dir === "asc" ? "desc" : "asc";
      else {
        state.list.sort = col;
        state.list.dir = ["name", "email", "phone"].includes(col) ? "asc" : "desc";
      }
      state.list.page = 1;
      loadPlayers();
    });
  });

  let searchTimer = 0;
  function runSearch() {
    clearTimeout(searchTimer);
    const q = $("searchBox").value.trim();
    if (q === state.list.q) return;
    state.list.q = q;
    state.list.page = 1;
    loadPlayers();
  }
  $("searchBox").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
  });
  $("searchBox").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
  $("btnClearSearch").addEventListener("click", () => {
    $("searchBox").value = "";
    runSearch();
    $("searchBox").focus();
  });

  $("playersBody").addEventListener("change", (e) => {
    const cb = e.target;
    if (cb.type !== "checkbox") return;
    if (cb.checked) state.selected.add(cb.dataset.id);
    else state.selected.delete(cb.dataset.id);
    updateSelection();
  });
  $("checkAll").addEventListener("change", (e) => {
    const on = e.target.checked;
    state.selected.clear();
    document.querySelectorAll("#playersBody input[type=checkbox]").forEach((cb) => {
      cb.checked = on;
      if (on) state.selected.add(cb.dataset.id);
    });
    updateSelection();
  });

  async function deletePlayers(ids, text) {
    const ok = await confirmBox("Xoá người chơi?", text, "Xoá");
    if (!ok) return;
    try {
      const data = await api("POST", "/api/admin/players/delete", { ids });
      closeDetail();
      toast(`Đã xoá ${data.deleted} người chơi`);
    } catch (err) {
      if (err.status === 404) { closeDetail(); toast("Người chơi không còn tồn tại.", true); }
      else if (err.status !== 401 && err.status !== 403) toast(err.message, true);
    }
    loadPlayers();
  }

  $("playersBody").addEventListener("click", (e) => {
    const del = e.target.closest("button[data-delete]");
    if (del) {
      deletePlayers([del.dataset.delete],
        `Xoá vĩnh viễn ${del.dataset.name} (${del.dataset.email}) và toàn bộ điểm của người này. Không thể hoàn tác.`);
      return;
    }
    const det = e.target.closest("button[data-detail]");
    if (det) openDetail(det.dataset.detail);
  });

  $("btnDeleteSelected").addEventListener("click", () => {
    const ids = [...state.selected];
    if (!ids.length) return;
    deletePlayers(ids, `Xoá vĩnh viễn ${ids.length} người chơi và toàn bộ điểm của họ. Không thể hoàn tác.`);
  });

  async function openDetail(id) {
    let data;
    try {
      data = await api("GET", "/api/admin/players/" + encodeURIComponent(id));
    } catch (err) {
      if (err.status === 404) { toast("Người chơi không còn tồn tại.", true); loadPlayers(); }
      else if (err.status !== 401 && err.status !== 403) toast(err.message, true);
      return;
    }
    const p = data.player;
    state.detailId = p.id;
    $("detailTitle").textContent = p.name;
    const dl = $("detailInfo");
    dl.textContent = "";
    [
      ["Họ tên", p.name], ["Email", p.email], ["Số điện thoại", p.phone],
      ["Ngày đăng ký", fmtDate(p.createdAt)], ["Cập nhật gần nhất", fmtDate(p.updatedAt)],
      ["Đồng ý xử lý dữ liệu", `${fmtDate(p.consentAt)} (thông báo ${p.consentVersion})`],
    ].forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    });
    const rb = $("detailRounds");
    rb.textContent = "";
    if (!data.rounds.length) {
      const tr = document.createElement("tr");
      const c = td("Chưa chơi lượt nào.");
      c.colSpan = 2;
      tr.appendChild(c);
      rb.appendChild(tr);
    }
    data.rounds.forEach((r) => {
      const tr = document.createElement("tr");
      tr.appendChild(td(fmtDate(r.endedAt)));
      tr.appendChild(td(r.score, "num"));
      rb.appendChild(tr);
    });
    $("btnDeleteOne").dataset.name = p.name;
    $("btnDeleteOne").dataset.email = p.email;
    $("detailModal").hidden = false;
    $("detailModal").querySelector("[data-close]").focus();
  }

  $("btnDeleteOne").addEventListener("click", () => {
    if (!state.detailId) return;
    const b = $("btnDeleteOne");
    deletePlayers([state.detailId],
      `Xoá vĩnh viễn ${b.dataset.name} (${b.dataset.email}) và toàn bộ điểm của người này. Không thể hoàn tác.`);
  });

  /* F20 · Xuất CSV: kiểm tra phiên trước, rồi để trình duyệt tải file */
  $("btnExport").addEventListener("click", async () => {
    try {
      const me = await api("GET", "/api/admin/me");
      if (!me.admin) { showLogin("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."); return; }
    } catch (err) {
      if (err.status !== 401 && err.status !== 403) toast(err.message, true);
      return;
    }
    const a = document.createElement("a");
    a.href = "/api/admin/players.csv?" + listParams(false);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* ---------------- Tài khoản admin (F21) ---------------- */
  async function loadAdmins() {
    let data;
    try {
      data = await api("GET", "/api/admin/admins");
    } catch (err) {
      if (err.status !== 401 && err.status !== 403) toast(err.message, true);
      return;
    }
    const body = $("adminsBody");
    body.textContent = "";
    data.admins.forEach((a) => {
      const tr = document.createElement("tr");
      const tdName = td(a.name);
      if (a.id === data.me) {
        const tag = document.createElement("span");
        tag.className = "me-tag";
        tag.textContent = " (bạn)";
        tdName.appendChild(tag);
      }
      tr.appendChild(tdName);
      tr.appendChild(td(a.email));
      const tdStatus = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge" + (a.active ? "" : " badge--off");
      badge.textContent = a.active ? "Hoạt động" : "Đã khoá";
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);
      tr.appendChild(td(fmtDate(a.lastLoginAt)));
      const tdAct = document.createElement("td");
      if (a.id !== data.me) {
        const row = document.createElement("div");
        row.className = "row";
        const lock = document.createElement("button");
        lock.type = "button";
        lock.className = "btn btn--secondary btn--sm";
        lock.dataset.adminAction = a.active ? "lock" : "unlock";
        lock.dataset.id = a.id;
        lock.dataset.name = a.name;
        lock.textContent = a.active ? "Khoá" : "Mở khoá";
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn--danger btn--sm";
        del.dataset.adminAction = "delete";
        del.dataset.id = a.id;
        del.dataset.name = a.name;
        del.textContent = "Xoá";
        row.appendChild(lock);
        row.appendChild(del);
        tdAct.appendChild(row);
      }
      tr.appendChild(tdAct);
      body.appendChild(tr);
    });
  }

  $("adminsBody").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-admin-action]");
    if (!b) return;
    const action = b.dataset.adminAction;
    const name = b.dataset.name;
    const texts = {
      lock: ["Khoá admin?", `Khoá tài khoản ${name}. Người này bị đăng xuất ngay và không đăng nhập được cho đến khi mở khoá.`, "Khoá"],
      unlock: ["Mở khoá admin?", `Mở khoá tài khoản ${name}.`, "Mở khoá"],
      delete: ["Xoá admin?", `Xoá vĩnh viễn tài khoản admin ${name}. Không thể hoàn tác.`, "Xoá"],
    };
    const [title, text, label] = texts[action];
    if (!(await confirmBox(title, text, label))) return;
    try {
      await api("POST", `/api/admin/admins/${encodeURIComponent(b.dataset.id)}/${action}`, {});
      toast({ lock: "Đã khoá admin.", unlock: "Đã mở khoá admin.", delete: "Đã xoá admin." }[action]);
    } catch (err) {
      if (err.status !== 401 && err.status !== 403) toast(err.message, true);
    }
    loadAdmins();
  });

  function genPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const b = new Uint32Array(14);
    window.crypto.getRandomValues(b);
    return Array.from(b, (x) => chars[x % chars.length]).join("");
  }

  $("btnAddAdmin").addEventListener("click", () => {
    $("addAdminForm").reset();
    ["errNewName", "errNewEmail", "errNewPassword"].forEach((x) => { $(x).textContent = ""; });
    $("addAdminForm").hidden = false;
    $("newName").focus();
  });
  $("btnCancelAdd").addEventListener("click", () => { $("addAdminForm").hidden = true; });
  $("btnGenPw").addEventListener("click", () => { $("newPassword").value = genPassword(); });

  $("addAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    ["errNewName", "errNewEmail", "errNewPassword"].forEach((x) => { $(x).textContent = ""; });
    const name = $("newName").value;
    const email = $("newEmail").value;
    const password = $("newPassword").value;
    let bad = false;
    if (Array.from(V.normalizeName(name)).length < 2) { $("errNewName").textContent = "Họ tên từ 2 đến 60 ký tự."; bad = true; }
    const em = V.checkEmail(email);
    if (em.error) { $("errNewEmail").textContent = em.error; bad = true; }
    if (password.length < 10) { $("errNewPassword").textContent = "Mật khẩu phải có ít nhất 10 ký tự."; bad = true; }
    if (bad) return;
    try {
      await api("POST", "/api/admin/admins", { name, email, password });
      $("addAdminForm").hidden = true;
      toast("Đã tạo admin. Nhớ gửi mật khẩu tạm cho người đó.");
      loadAdmins();
    } catch (err) {
      const errs = err.data && err.data.errors;
      if (errs) {
        if (errs.name) $("errNewName").textContent = errs.name;
        if (errs.email) $("errNewEmail").textContent = errs.email;
        if (errs.password) $("errNewPassword").textContent = errs.password;
      } else if (err.status !== 401 && err.status !== 403) toast(err.message, true);
    }
  });

  window.addEventListener("hashchange", route);
  boot();
})();
