/* ==========================================================================
   Đập Chuột — logic game (theo docs/02, 03, 04)
   - Một vòng lặp duy nhất, thời gian tính theo đồng hồ thật (performance.now)
   - Mọi sự kiện (chuột hiện, chuột lặn, hết giờ, cú bấm) xử lý theo thứ tự thời gian
   ========================================================================== */
(function () {
  "use strict";

  // Phần đăng ký người chơi và gửi điểm (app/player.js)
  const Player = window.DapChuotPlayer || null;

  /* ---------- 4.1 · Thông số ---------- */
  const CFG = {
    CELLS: 9,
    ROUND_MS: 30000,
    STAY_MIN: 600, STAY_MAX: 1200,   // chuột ở trên bàn
    GAP_MIN: 200,  GAP_MAX: 500,     // khoảng nghỉ trước con tiếp theo
    IGNORE_MS: 300,                  // bỏ qua bấm đúp sau khi đập trúng
    WARN_SECONDS: 5,                 // đồng hồ cảnh báo khi còn ≤ 5 giây
    FX_MS: 450,                      // hiệu ứng < 0,5 giây
    STORAGE_KEY: "dapchuot.kyluc",
  };

  /* ---------- 4.2 · Điểm theo combo ---------- */
  function pointsFor(combo) {
    if (combo >= 5) return 3;
    if (combo >= 3) return 2;
    return 1;
  }

  const rand = (min, max) => min + Math.random() * (max - min);

  /* ---------- Phần tử giao diện ---------- */
  const $ = (id) => document.getElementById(id);
  const ui = {
    screens: { register: $("screenRegister"), start: $("screenStart"), playing: $("screenPlay"), over: $("screenOver") },
    startRecord: $("startRecord"),
    btnStart: $("btnStart"),
    btnRestart: $("btnRestart"),
    hudScore: $("hudScore"),
    hudCombo: $("hudCombo"),
    hudComboValue: $("hudComboValue"),
    hudTime: $("hudTime"),
    hudTimeValue: $("hudTimeValue"),
    board: $("board"),
    overScore: $("overScore"),
    overRecord: $("overRecord"),
    newRecord: $("newRecord"),
  };

  // Tạo 9 ô
  const cells = [];
  for (let i = 0; i < CFG.CELLS; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(i);
    cell.setAttribute("aria-label", "Ô " + (i + 1));
    const mole = document.createElement("span");
    mole.className = "mole";
    mole.setAttribute("aria-hidden", "true");
    mole.textContent = "🐭";
    cell.appendChild(mole);
    ui.board.appendChild(cell);
    cells.push(cell);
  }

  /* ---------- 4.5 · Kỷ lục ---------- */
  let sessionRecord = 0; // dùng khi trình duyệt không cho lưu

  function readRecord() {
    try {
      const raw = window.localStorage.getItem(CFG.STORAGE_KEY);
      if (raw !== null && /^\d+$/.test(raw)) {
        const n = parseInt(raw, 10);
        if (Number.isSafeInteger(n)) sessionRecord = Math.max(sessionRecord, n);
      }
    } catch (e) { /* bị chặn: giữ kỷ lục trong phiên */ }
    return sessionRecord;
  }

  function writeRecord(value) {
    sessionRecord = value;
    try { window.localStorage.setItem(CFG.STORAGE_KEY, String(value)); }
    catch (e) { /* bị chặn: chỉ giữ trong phiên, không báo lỗi */ }
  }

  /* ---------- 4.4 · Trạng thái ---------- */
  const game = {
    screen: "start",
    roundId: 0,
    score: 0,
    combo: 0,
    startTime: 0,
    endTime: 0,
    activeCell: null,
    lastCell: null,
    lastHitCell: null,
    lastHitTime: -Infinity,
    moleShownAt: 0,
    moleHideAt: 0,
    nextSpawnAt: null,
    lastGoneAt: 0,
    rafId: 0,
  };

  /* ---------- Chế độ gỡ lỗi (?debug=1) ---------- */
  const DEBUG = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
  const dbg = {
    panel: $("debugPanel"), log: $("debugLog"), active: $("debugActive"),
    current: null,
  };
  if (DEBUG) { dbg.panel.hidden = false; document.body.classList.add("is-debug"); }

  function dbgSpawn(cell, t, gap) {
    if (!DEBUG) return;
    const li = document.createElement("li");
    const sec = ((t - game.startTime) / 1000).toFixed(2);
    li.innerHTML = 'giây ' + sec + ' · <span class="cell-tag">ô ' + (cell + 1) + '</span> · nghỉ trước ' +
      (gap === null ? "—" : Math.round(gap) + "ms") + ' · <span class="dbg-res">đang trên bàn…</span>';
    dbg.log.appendChild(li);
    dbg.log.scrollTop = dbg.log.scrollHeight;
    dbg.current = li;
    dbg.active.textContent = "ô đang có chuột: " + (cell + 1);
    cells.forEach((c, i) => c.classList.toggle("debug-active", i === cell));
  }
  function dbgGone(result, t) {
    if (!DEBUG || !dbg.current) return;
    dbg.current.querySelector(".dbg-res").textContent =
      result + " · ở trên bàn " + Math.round(t - game.moleShownAt) + "ms";
    dbg.current = null;
    dbg.active.textContent = "ô đang có chuột: —";
    cells.forEach((c) => c.classList.remove("debug-active"));
  }
  // Cho phép đọc trạng thái khi kiểm thử tự động (chỉ khi gỡ lỗi)
  if (DEBUG) {
    window.__dapchuot = {
      get state() {
        return { screen: game.screen, score: game.score, combo: game.combo, activeCell: game.activeCell, lastHitCell: game.lastHitCell };
      },
    };
  }

  /* ---------- Hiển thị ---------- */
  function showScreen(name) {
    game.screen = name;
    ui.screens.register.hidden = name !== "register";
    ui.screens.start.hidden = name !== "start";
    ui.screens.playing.hidden = name !== "playing";
    ui.screens.over.hidden = name !== "over";
  }

  function renderScore() { ui.hudScore.textContent = String(game.score); }

  function renderCombo(bumped) {
    if (game.combo >= 2) {
      ui.hudComboValue.textContent = String(game.combo);
      ui.hudCombo.hidden = false;
      if (bumped) {
        ui.hudCombo.classList.remove("is-bump");
        void ui.hudCombo.offsetWidth; // khởi động lại hiệu ứng
        ui.hudCombo.classList.add("is-bump");
      }
    } else {
      ui.hudCombo.hidden = true;
      ui.hudCombo.classList.remove("is-bump");
    }
  }

  let shownSeconds = -1;
  function renderTime(now) {
    const leftMs = Math.max(0, game.endTime - now);
    const seconds = Math.ceil(leftMs / 1000); // làm tròn lên theo giây
    if (seconds !== shownSeconds) {
      shownSeconds = seconds;
      ui.hudTimeValue.textContent = String(seconds);
      ui.hudTime.classList.toggle("is-warning", seconds <= CFG.WARN_SECONDS);
    }
  }

  function setMole(index, on) {
    cells[index].classList.toggle("has-mole", on);
  }

  // Các hiệu ứng ngắn: hẹn giờ riêng, bị huỷ hết khi sang lượt mới
  const fxTimers = new Set();
  function later(fn, ms) {
    const id = window.setTimeout(() => { fxTimers.delete(id); fn(); }, ms);
    fxTimers.add(id);
  }
  function clearFx() {
    fxTimers.forEach((id) => window.clearTimeout(id));
    fxTimers.clear();
    cells.forEach((c) => {
      c.classList.remove("has-mole", "is-hit", "is-miss", "debug-active");
      c.querySelectorAll(".float").forEach((f) => f.remove());
    });
  }

  function floatText(index, text, kind) {
    const el = document.createElement("span");
    el.className = "float float--" + kind;
    el.textContent = text;
    cells[index].appendChild(el);
    later(() => el.remove(), CFG.FX_MS);
  }

  function hitEffect(index, pts) {
    const cell = cells[index];
    cell.classList.add("is-hit");
    floatText(index, "+" + pts, "plus");
    later(() => cell.classList.remove("is-hit", "has-mole"), 280);
  }

  function missEffect(index, deducted) {
    const cell = cells[index];
    cell.classList.remove("is-miss");
    void cell.offsetWidth;
    cell.classList.add("is-miss");
    if (deducted) floatText(index, "−1", "minus");
    later(() => cell.classList.remove("is-miss"), 380);
  }

  /* ---------- Nhịp chuột (F04) ---------- */
  function pickCell() {
    let idx;
    do { idx = Math.floor(Math.random() * CFG.CELLS); } while (idx === game.lastCell);
    return idx;
  }

  // Chuột biến mất tại thời điểm t → hẹn con tiếp theo sau 0,2–0,5 giây
  function scheduleNext(t) {
    game.lastGoneAt = t;
    game.nextSpawnAt = t + rand(CFG.GAP_MIN, CFG.GAP_MAX);
  }

  function spawn(t) {
    const idx = pickCell();
    const gap = game.lastCell === null ? null : t - game.lastGoneAt;
    game.activeCell = idx;
    game.lastCell = idx;
    game.moleShownAt = t;
    game.moleHideAt = t + rand(CFG.STAY_MIN, CFG.STAY_MAX);
    game.nextSpawnAt = null;
    cells[idx].classList.remove("is-hit");
    setMole(idx, true);
    dbgSpawn(idx, t, gap);
  }

  // F08 · Bỏ lỡ: không trừ điểm, combo về 0
  function moleEscapes(t) {
    const idx = game.activeCell;
    game.activeCell = null;
    setMole(idx, false);
    dbgGone("tự lặn (bỏ lỡ)", t);
    game.combo = 0;
    renderCombo(false);
    scheduleNext(t);
  }

  /* Xử lý mọi sự kiện có thời điểm ≤ t, theo đúng thứ tự thời gian */
  function advanceTo(t) {
    for (let guard = 0; guard < 1000 && game.screen === "playing"; guard++) {
      const events = [];
      events.push(["end", game.endTime]);
      if (game.activeCell !== null) events.push(["escape", game.moleHideAt]);
      if (game.activeCell === null && game.nextSpawnAt !== null) events.push(["spawn", game.nextSpawnAt]);
      events.sort((a, b) => a[1] - b[1]);
      const [kind, at] = events[0];
      if (at > t) return;
      if (kind === "end") { endRound(at); return; }
      if (kind === "escape") moleEscapes(at);
      else if (kind === "spawn") {
        if (at >= game.endTime) { game.nextSpawnAt = null; continue; }
        spawn(at);
      }
    }
  }

  /* ---------- Vòng lặp duy nhất ---------- */
  function loop() {
    game.rafId = 0;
    if (game.screen !== "playing") return;
    const now = performance.now();
    advanceTo(now);
    if (game.screen === "playing") {
      renderTime(now);
      game.rafId = window.requestAnimationFrame(loop);
    }
  }
  function stopLoop() {
    if (game.rafId) window.cancelAnimationFrame(game.rafId);
    game.rafId = 0;
  }

  /* ---------- F02 / F11 · Bắt đầu lượt ---------- */
  function startRound() {
    if (game.screen === "playing") return; // bấm nhiều lần chỉ tạo 1 lượt
    // F14 · Máy chưa đăng ký (hoặc người chơi đã bị xoá) → về màn hình Đăng ký
    if (Player && !Player.canPlay()) { Player.showRegister(); return; }
    stopLoop();
    clearFx();
    if (DEBUG) dbg.log.innerHTML = "";

    const now = performance.now();
    game.roundId++;
    game.score = 0;
    game.combo = 0;
    game.startTime = now;
    game.endTime = now + CFG.ROUND_MS;
    game.activeCell = null;
    game.lastCell = null;
    game.lastHitCell = null;
    game.lastHitTime = -Infinity;
    game.moleShownAt = 0;
    game.moleHideAt = 0;
    game.lastGoneAt = now;
    game.nextSpawnAt = now + rand(CFG.GAP_MIN, CFG.GAP_MAX); // con đầu tiên sau khoảng nghỉ ngắn
    shownSeconds = -1;

    renderScore();
    renderCombo(false);
    renderTime(now);
    showScreen("playing");
    game.rafId = window.requestAnimationFrame(loop);
  }

  /* ---------- F10 · Kết thúc lượt ---------- */
  function endRound(t) {
    if (game.screen !== "playing") return;
    if (game.activeCell !== null) {
      setMole(game.activeCell, false);   // biến mất, không tính bỏ lỡ
      dbgGone("hết giờ", t);
      game.activeCell = null;
    }
    game.nextSpawnAt = null;
    stopLoop();
    renderTime(t);
    showScreen("over");
    clearFx();

    // F12 · Kỷ lục
    const oldRecord = readRecord();
    const isNew = game.score > oldRecord && game.score > 0;
    if (isNew) writeRecord(game.score);
    ui.overScore.textContent = String(game.score);
    ui.overRecord.textContent = String(isNew ? game.score : oldRecord);
    ui.newRecord.hidden = !isNew;
    ui.startRecord.textContent = String(isNew ? game.score : oldRecord);

    // F15 · Gửi điểm lượt này lên server (chạy ngầm, không làm chậm màn hình Kết thúc)
    if (Player) Player.roundEnded(game.score);
  }

  /* ---------- 4.3 · Xử lý một cú bấm ---------- */
  function eventTime(e) {
    const now = performance.now();
    const ts = e && typeof e.timeStamp === "number" ? e.timeStamp : now;
    // timeStamp cùng mốc với performance.now(); nếu lệch bất thường thì dùng thời điểm hiện tại
    return ts > 0 && ts <= now + 50 && ts >= now - 1000 ? Math.min(ts, now) : now;
  }

  function handlePress(index, t) {
    // Xử lý trước mọi sự kiện xảy ra sớm hơn cú bấm (chuột lặn, hết giờ…)
    advanceTo(t);

    // Bước 1: lượt chưa bắt đầu hoặc đã kết thúc
    if (game.screen !== "playing") return;

    // Bước 2: chống bấm đúp ô vừa đập trúng
    if (index === game.lastHitCell && t - game.lastHitTime < CFG.IGNORE_MS) return;

    // Bước 3: đập trúng
    if (index === game.activeCell) {
      game.activeCell = null;
      game.combo += 1;
      const pts = pointsFor(game.combo);
      game.score += pts;
      game.lastHitCell = index;
      game.lastHitTime = t;
      dbgGone("đập trúng +" + pts, t);
      hitEffect(index, pts);
      renderScore();
      renderCombo(true);
      scheduleNext(t);
      return;
    }

    // Bước 4: bấm trượt
    const deducted = game.score > 0;
    game.score = Math.max(0, game.score - 1);
    game.combo = 0;
    missEffect(index, deducted);
    renderScore();
    renderCombo(false);
  }

  /* ---------- Sự kiện ---------- */
  ui.board.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || !ui.board.contains(cell)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault(); // không chọn chữ, không zoom, không phát sinh click giả
    handlePress(Number(cell.dataset.index), eventTime(e));
  });
  ui.board.addEventListener("contextmenu", (e) => e.preventDefault());
  // Chặn kéo/cuộn khi ngón tay di chuyển trên lưới
  ui.board.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  ui.board.addEventListener("dblclick", (e) => e.preventDefault());

  ui.btnStart.addEventListener("click", startRound);
  ui.btnRestart.addEventListener("click", startRound);

  // Quay lại tab: đồng hồ vẫn theo thời gian thực
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && game.screen === "playing") {
      advanceTo(performance.now());
      if (game.screen === "playing" && !game.rafId) game.rafId = window.requestAnimationFrame(loop);
    }
  });

  /* ---------- F01 / F13 / F14 · Mở trang ---------- */
  ui.startRecord.textContent = String(readRecord());
  if (Player) Player.init({ showScreen });
  else showScreen("start");
})();
